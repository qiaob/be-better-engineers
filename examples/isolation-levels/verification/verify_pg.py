"""在 PostgreSQL 上实际跑一遍学习页里的每个并发场景，结果写进 verify_pg.txt。

用法：python verify_pg.py "dbname=isolation_lab"
需要 psycopg 3。每个场景用两个连接 A、B 手动交错执行语句。
"""
import sys
import threading
import time

import psycopg

DSN = sys.argv[1] if len(sys.argv) > 1 else "dbname=isolation_lab"
out = []


def log(s=""):
    print(s)
    out.append(s)


def conn():
    return psycopg.connect(DSN, autocommit=True)


def one(c, sql, *args):
    return c.execute(sql, args).fetchone()[0]


def reset(c):
    c.execute("DROP TABLE IF EXISTS acc, item, orders, doctors")
    c.execute("CREATE TABLE acc(id int PRIMARY KEY, bal int)")
    c.execute("INSERT INTO acc VALUES (1, 100)")
    c.execute("CREATE TABLE item(id int PRIMARY KEY, stock int)")
    c.execute("INSERT INTO item VALUES (1, 10)")
    c.execute("CREATE TABLE orders(id serial PRIMARY KEY, amount int)")
    c.execute("INSERT INTO orders(amount) VALUES (50), (150), (300)")
    c.execute("CREATE TABLE doctors(name text PRIMARY KEY, on_call bool)")
    c.execute("INSERT INTO doctors VALUES ('alice', true), ('bob', true)")


def try_exec(c, sql):
    try:
        c.execute(sql)
        return "ok"
    except psycopg.Error as e:
        return "ERROR %s: %s" % (e.sqlstate, str(e).splitlines()[0])


admin = conn()
log("server_version = " + one(admin, "SHOW server_version"))
log("default_transaction_isolation = " + one(admin, "SHOW default_transaction_isolation"))
log()

# S1 读未提交：PostgreSQL 会不会脏读
reset(admin)
A, B = conn(), conn()
A.execute("BEGIN ISOLATION LEVEL READ UNCOMMITTED")
B.execute("BEGIN")
B.execute("UPDATE acc SET bal = 50 WHERE id = 1")
log("S1 读未提交 + B 改成 50 但未提交，A 读到：%s" % one(A, "SELECT bal FROM acc WHERE id = 1"))
B.execute("ROLLBACK"); A.execute("COMMIT")
log()

# S2/S3 不可重复读：读已提交 vs 可重复读（以及读未提交，看它是不是和读已提交一样）
for level in ["READ UNCOMMITTED", "READ COMMITTED", "REPEATABLE READ", "SERIALIZABLE"]:
    reset(admin)
    A, B = conn(), conn()
    A.execute("BEGIN ISOLATION LEVEL " + level)
    r1 = one(A, "SELECT bal FROM acc WHERE id = 1")
    B.execute("BEGIN"); B.execute("UPDATE acc SET bal = 50 WHERE id = 1")
    r2 = one(A, "SELECT bal FROM acc WHERE id = 1")
    B.execute("COMMIT")
    r3 = one(A, "SELECT bal FROM acc WHERE id = 1")
    A.execute("COMMIT")
    log("S2 %-16s A 第 1 次读 %s；B 改未提交时 A 第 2 次读 %s；B 提交后 A 第 3 次读 %s" % (level, r1, r2, r3))
log()

# S4 快照在 BEGIN 时取，还是在第一条语句时取
reset(admin)
A, B = conn(), conn()
A.execute("BEGIN ISOLATION LEVEL REPEATABLE READ")
B.execute("UPDATE acc SET bal = 50 WHERE id = 1")  # 自动提交
r = one(A, "SELECT bal FROM acc WHERE id = 1")
A.execute("COMMIT")
log("S4 可重复读：A 先 BEGIN，B 再改成 50 并提交，A 的第一条 SELECT 读到 %s" % r)
log()

# S5 幻读：按条件数行，别人插入了一行
for level in ["READ COMMITTED", "REPEATABLE READ"]:
    reset(admin)
    A, B = conn(), conn()
    A.execute("BEGIN ISOLATION LEVEL " + level)
    n1 = one(A, "SELECT count(*) FROM orders WHERE amount > 100")
    B.execute("INSERT INTO orders(amount) VALUES (200)")
    n2 = one(A, "SELECT count(*) FROM orders WHERE amount > 100")
    A.execute("COMMIT")
    log("S5 %-16s A 数 amount>100 的行：%s；B 插入一行 200 并提交后 A 再数：%s" % (level, n1, n2))
log()

# S6 丢失更新：应用里先读后写（读出 10，算出 9，写回 9）
for level in ["READ COMMITTED", "REPEATABLE READ", "SERIALIZABLE"]:
    reset(admin)
    A, B = conn(), conn()
    A.execute("BEGIN ISOLATION LEVEL " + level)
    B.execute("BEGIN ISOLATION LEVEL " + level)
    a = one(A, "SELECT stock FROM item WHERE id = 1")
    b = one(B, "SELECT stock FROM item WHERE id = 1")
    A.execute("UPDATE item SET stock = %d WHERE id = 1" % (a - 1))
    A.execute("COMMIT")
    res = try_exec(B, "UPDATE item SET stock = %d WHERE id = 1" % (b - 1))
    if res == "ok":
        res = try_exec(B, "COMMIT")
    else:
        B.execute("ROLLBACK")
    final = one(admin, "SELECT stock FROM item WHERE id = 1")
    log("S6 %-16s A 读 %s 写 %s 提交；B 读 %s 写 %s：%s；最终库存 %s（两人各卖一件，应为 8）" % (level, a, a - 1, b, b - 1, res, final))
log()


def in_thread(fn):
    box = {}

    def run():
        t0 = time.time()
        try:
            box["value"] = fn()
        except psycopg.Error as e:
            box["value"] = "ERROR %s: %s" % (e.sqlstate, str(e).splitlines()[0])
        box["waited"] = time.time() - t0

    th = threading.Thread(target=run)
    th.start()
    return th, box


# S7 原子更新：UPDATE stock = stock - 1，读已提交下
reset(admin)
A, B = conn(), conn()
A.execute("BEGIN"); B.execute("BEGIN")
A.execute("UPDATE item SET stock = stock - 1 WHERE id = 1")
th, box = in_thread(lambda: B.execute("UPDATE item SET stock = stock - 1 WHERE id = 1 RETURNING stock").fetchone()[0])
time.sleep(0.5)
A.execute("COMMIT")
th.join()
B.execute("COMMIT")
log("S7 读已提交 原子更新：B 等了 %.1f 秒，拿到 %s；最终库存 %s" % (box["waited"], box["value"], one(admin, "SELECT stock FROM item WHERE id = 1")))

# S8 SELECT ... FOR UPDATE，读已提交下
reset(admin)
A, B = conn(), conn()
A.execute("BEGIN"); B.execute("BEGIN")
a = one(A, "SELECT stock FROM item WHERE id = 1 FOR UPDATE")
th, box = in_thread(lambda: B.execute("SELECT stock FROM item WHERE id = 1 FOR UPDATE").fetchone()[0])
time.sleep(0.5)
A.execute("UPDATE item SET stock = %d WHERE id = 1" % (a - 1)); A.execute("COMMIT")
th.join()
B.execute("UPDATE item SET stock = %d WHERE id = 1" % (box["value"] - 1)); B.execute("COMMIT")
log("S8 读已提交 FOR UPDATE：A 读到 %s；B 等了 %.1f 秒后读到 %s；最终库存 %s" % (a, box["waited"], box["value"], one(admin, "SELECT stock FROM item WHERE id = 1")))

# S9 可重复读下，B 的 UPDATE 在 A 提交前发出：先等，A 一提交就报错
reset(admin)
A, B = conn(), conn()
A.execute("BEGIN ISOLATION LEVEL REPEATABLE READ"); B.execute("BEGIN ISOLATION LEVEL REPEATABLE READ")
a = one(A, "SELECT stock FROM item WHERE id = 1"); b = one(B, "SELECT stock FROM item WHERE id = 1")
A.execute("UPDATE item SET stock = %d WHERE id = 1" % (a - 1))
th, box = in_thread(lambda: B.execute("UPDATE item SET stock = %d WHERE id = 1" % (b - 1)) and "ok")
time.sleep(0.5)
A.execute("COMMIT")
th.join()
try_exec(B, "ROLLBACK")
log("S9 可重复读 B 的 UPDATE 先等 A：等了 %.1f 秒，结果 %s" % (box["waited"], box["value"]))
log()

# S10 写偏斜：两位医生都值班，规则是至少留一人。两人同时请假
for level in ["READ COMMITTED", "REPEATABLE READ", "SERIALIZABLE"]:
    reset(admin)
    A, B = conn(), conn()
    A.execute("BEGIN ISOLATION LEVEL " + level); B.execute("BEGIN ISOLATION LEVEL " + level)
    na = one(A, "SELECT count(*) FROM doctors WHERE on_call")
    nb = one(B, "SELECT count(*) FROM doctors WHERE on_call")
    ra = try_exec(A, "UPDATE doctors SET on_call = false WHERE name = 'alice'")
    rb = try_exec(B, "UPDATE doctors SET on_call = false WHERE name = 'bob'")
    ca = try_exec(A, "COMMIT") if ra == "ok" else (A.execute("ROLLBACK") and "rolled back")
    cb = try_exec(B, "COMMIT") if rb == "ok" else (B.execute("ROLLBACK") and "rolled back")
    left = one(admin, "SELECT count(*) FROM doctors WHERE on_call")
    log("S10 %-16s A 看到 %s 人值班，B 看到 %s 人；A 的 UPDATE %s，COMMIT %s；B 的 UPDATE %s，COMMIT %s；最后还在值班：%s 人" % (level, na, nb, ra, ca, rb, cb, left))
log()

# S11 可串行化下，被拒的那个重试一次
reset(admin)
A, B = conn(), conn()
A.execute("BEGIN ISOLATION LEVEL SERIALIZABLE"); B.execute("BEGIN ISOLATION LEVEL SERIALIZABLE")
one(A, "SELECT count(*) FROM doctors WHERE on_call"); one(B, "SELECT count(*) FROM doctors WHERE on_call")
A.execute("UPDATE doctors SET on_call = false WHERE name = 'alice'")
B.execute("UPDATE doctors SET on_call = false WHERE name = 'bob'")
A.execute("COMMIT")
r = try_exec(B, "COMMIT")
B.execute("BEGIN ISOLATION LEVEL SERIALIZABLE")
n = one(B, "SELECT count(*) FROM doctors WHERE on_call")
B.execute("ROLLBACK")
log("S11 可串行化：B 提交 %s；B 重试时重新数，看到 %s 人值班，按规则不该再请假" % (r, n))

with open(__file__.rsplit("/", 1)[0] + "/verify_pg.txt", "w", encoding="utf-8") as f:
    f.write("\n".join(out) + "\n")
