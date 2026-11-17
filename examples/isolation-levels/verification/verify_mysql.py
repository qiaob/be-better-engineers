"""在 MySQL（InnoDB）上跑和 verify_pg.py 对应的场景，结果写进 verify_mysql.txt。

用法：python verify_mysql.py
需要 PyMySQL，按本机 root 用 unix socket 连接。
"""
import threading
import time

import pymysql
import pymysql.constants.CLIENT

out = []


def log(s=""):
    print(s)
    out.append(s)


def conn():
    c = pymysql.connect(unix_socket="/var/run/mysqld/mysqld.sock", user="root", database="isolation_lab", autocommit=True,
                        client_flag=pymysql.constants.CLIENT.FOUND_ROWS)  # rowcount 按匹配到的行数算
    c.cursor().execute("SET SESSION innodb_lock_wait_timeout = 3")
    return c


def ex(c, sql):
    cur = c.cursor()
    cur.execute(sql)
    return cur


def one(c, sql):
    return ex(c, sql).fetchone()[0]


def try_exec(c, sql):
    try:
        cur = ex(c, sql)
        return "ok（影响 %d 行）" % cur.rowcount if sql.startswith("UPDATE") else "ok"
    except pymysql.MySQLError as e:
        return "ERROR %s: %s" % (e.args[0], e.args[1])


def begin(c, level):
    ex(c, "SET TRANSACTION ISOLATION LEVEL " + level)
    ex(c, "START TRANSACTION")


def reset(c):
    for t in ["acc", "item", "orders", "doctors"]:
        ex(c, "DROP TABLE IF EXISTS " + t)
    ex(c, "CREATE TABLE acc(id int PRIMARY KEY, bal int) ENGINE=InnoDB")
    ex(c, "INSERT INTO acc VALUES (1, 100)")
    ex(c, "CREATE TABLE item(id int PRIMARY KEY, stock int) ENGINE=InnoDB")
    ex(c, "INSERT INTO item VALUES (1, 10)")
    ex(c, "CREATE TABLE orders(id int AUTO_INCREMENT PRIMARY KEY, amount int) ENGINE=InnoDB")
    ex(c, "INSERT INTO orders(amount) VALUES (50), (150), (300)")
    ex(c, "CREATE TABLE doctors(name varchar(20) PRIMARY KEY, on_call bool) ENGINE=InnoDB")
    ex(c, "INSERT INTO doctors VALUES ('alice', true), ('bob', true)")


admin = conn()
log("version = %s" % one(admin, "SELECT VERSION()"))
log("默认隔离级别 @@global.transaction_isolation = %s" % one(admin, "SELECT @@global.transaction_isolation"))
log()

# S2 读：未提交的修改看不看得见、提交后看不看得见
for level in ["READ UNCOMMITTED", "READ COMMITTED", "REPEATABLE READ"]:
    reset(admin)
    A, B = conn(), conn()
    begin(A, level)
    r1 = one(A, "SELECT bal FROM acc WHERE id = 1")
    begin(B, "READ COMMITTED"); ex(B, "UPDATE acc SET bal = 50 WHERE id = 1")
    r2 = one(A, "SELECT bal FROM acc WHERE id = 1")
    ex(B, "COMMIT")
    r3 = one(A, "SELECT bal FROM acc WHERE id = 1")
    ex(A, "COMMIT")
    log("S2 %-16s A 第 1 次读 %s；B 改未提交时 A 第 2 次读 %s；B 提交后 A 第 3 次读 %s" % (level, r1, r2, r3))
log()

# S5 幻读，以及可重复读下普通读和 UPDATE 看到的行不一样
for level in ["READ COMMITTED", "REPEATABLE READ"]:
    reset(admin)
    A, B = conn(), conn()
    begin(A, level)
    n1 = one(A, "SELECT count(*) FROM orders WHERE amount > 100")
    ex(B, "INSERT INTO orders(amount) VALUES (200)")
    n2 = one(A, "SELECT count(*) FROM orders WHERE amount > 100")
    u = ex(A, "UPDATE orders SET amount = amount + 1 WHERE amount > 100").rowcount
    n3 = one(A, "SELECT count(*) FROM orders WHERE amount > 100")
    ex(A, "COMMIT")
    log("S5 %-16s A 数 amount>100：%s；B 插入一行 200 并提交后 A 再数：%s；A 对这些行 UPDATE，影响 %s 行；之后 A 再数：%s" % (level, n1, n2, u, n3))
log()

# S6 丢失更新：应用里先读后写
for level in ["READ COMMITTED", "REPEATABLE READ"]:
    reset(admin)
    A, B = conn(), conn()
    begin(A, level); begin(B, level)
    a = one(A, "SELECT stock FROM item WHERE id = 1")
    b = one(B, "SELECT stock FROM item WHERE id = 1")
    ex(A, "UPDATE item SET stock = %d WHERE id = 1" % (a - 1)); ex(A, "COMMIT")
    res = try_exec(B, "UPDATE item SET stock = %d WHERE id = 1" % (b - 1))
    res += "，COMMIT " + try_exec(B, "COMMIT")
    log("S6 %-16s A 读 %s 写 %s 提交；B 读 %s 写 %s：%s；最终库存 %s（应为 8）" % (level, a, a - 1, b, b - 1, res, one(admin, "SELECT stock FROM item WHERE id = 1")))
log()


def in_thread(fn):
    box = {}

    def run():
        t0 = time.time()
        box["value"] = fn()
        box["waited"] = time.time() - t0

    th = threading.Thread(target=run)
    th.start()
    return th, box


# S10 写偏斜
for level in ["REPEATABLE READ", "SERIALIZABLE"]:
    reset(admin)
    A, B = conn(), conn()
    begin(A, level); begin(B, level)
    na = one(A, "SELECT count(*) FROM doctors WHERE on_call")
    nb = one(B, "SELECT count(*) FROM doctors WHERE on_call")
    th, box = in_thread(lambda: try_exec(A, "UPDATE doctors SET on_call = false WHERE name = 'alice'"))
    time.sleep(0.5)
    rb = try_exec(B, "UPDATE doctors SET on_call = false WHERE name = 'bob'")
    th.join()
    ra = box["value"]
    ca = try_exec(A, "COMMIT"); cb = try_exec(B, "COMMIT")
    log("S10 %-16s 各看到 %s/%s 人值班；A 的 UPDATE %s（等了 %.1f 秒）；B 的 UPDATE %s；COMMIT A %s，B %s%s；最后还在值班：%s 人" % (
        level, na, nb, ra, box["waited"], rb, ca, cb, "（死锁时 B 已被整个回滚，这里的 COMMIT 不提交任何东西）" if rb.startswith("ERROR") else "", one(admin, "SELECT count(*) FROM doctors WHERE on_call")))

with open(__file__.rsplit("/", 1)[0] + "/verify_mysql.txt", "w", encoding="utf-8") as f:
    f.write("\n".join(out) + "\n")
