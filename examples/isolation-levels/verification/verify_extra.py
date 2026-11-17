"""补充几个场景：带条件的原子更新、会议室预订（插入引起的写偏斜）、快照取在什么时候、FOR UPDATE 挡写偏斜。
结果写进 verify_extra.txt。用法：python verify_extra.py
"""
import threading
import time

import psycopg
import pymysql
import pymysql.constants.CLIENT

out = []


def log(s=""):
    print(s)
    out.append(s)


def pg():
    return psycopg.connect("dbname=isolation_lab", autocommit=True)


def my():
    c = pymysql.connect(unix_socket="/var/run/mysqld/mysqld.sock", user="root", database="isolation_lab",
                        autocommit=True, client_flag=pymysql.constants.CLIENT.FOUND_ROWS)
    c.cursor().execute("SET SESSION innodb_lock_wait_timeout = 3")
    return c


def run(c, sql):
    cur = c.cursor()
    cur.execute(sql)
    return cur


def try_run(c, sql):
    try:
        cur = run(c, sql)
        return "ok（%d 行）" % cur.rowcount if cur.rowcount >= 0 else "ok"
    except (psycopg.Error, pymysql.MySQLError) as e:
        code = getattr(e, "sqlstate", None) or e.args[0]
        return "ERROR %s: %s" % (code, str(e).splitlines()[0])


def bg(fn):
    box = {}

    def go():
        t0 = time.time()
        box["v"] = fn()
        box["t"] = time.time() - t0

    th = threading.Thread(target=go)
    th.start()
    return th, box


# E1 带条件的原子更新：库存只剩 1，两个人同时买
for name, mk, begin in [("PostgreSQL", pg, "BEGIN"), ("MySQL", my, "START TRANSACTION")]:
    adm = mk()
    run(adm, "DROP TABLE IF EXISTS item"); run(adm, "CREATE TABLE item(id int PRIMARY KEY, stock int)")
    run(adm, "INSERT INTO item VALUES (1, 1)")
    A, B = mk(), mk()
    run(A, begin); run(B, begin)
    ra = try_run(A, "UPDATE item SET stock = stock - 1 WHERE id = 1 AND stock > 0")
    th, box = bg(lambda: try_run(B, "UPDATE item SET stock = stock - 1 WHERE id = 1 AND stock > 0"))
    time.sleep(0.5)
    run(A, "COMMIT"); th.join(); run(B, "COMMIT")
    log("E1 %-10s 默认级别（PostgreSQL 是读已提交，MySQL 是可重复读），库存 1，两人同时 stock = stock - 1 WHERE stock > 0：A %s；B 等了 %.1f 秒后 %s；最终库存 %s" % (
        name, ra, box["t"], box["v"], run(adm, "SELECT stock FROM item").fetchone()[0]))
log()

# E2 会议室预订：先查时段有没有冲突，没有就插入
for level in ["REPEATABLE READ", "SERIALIZABLE"]:
    adm = pg()
    run(adm, "DROP TABLE IF EXISTS booking"); run(adm, "CREATE TABLE booking(id serial PRIMARY KEY, room int, slot int, who text)")
    A, B = pg(), pg()
    run(A, "BEGIN ISOLATION LEVEL " + level); run(B, "BEGIN ISOLATION LEVEL " + level)
    na = run(A, "SELECT count(*) FROM booking WHERE room = 1 AND slot = 9").fetchone()[0]
    nb = run(B, "SELECT count(*) FROM booking WHERE room = 1 AND slot = 9").fetchone()[0]
    ia = try_run(A, "INSERT INTO booking(room, slot, who) VALUES (1, 9, 'A')")
    ib = try_run(B, "INSERT INTO booking(room, slot, who) VALUES (1, 9, 'B')")
    ca = try_run(A, "COMMIT"); cb = try_run(B, "COMMIT")
    log("E2 PostgreSQL %-16s 两人都查到 %s/%s 条冲突；A 插入 %s 提交 %s；B 插入 %s 提交 %s；最终 9 点这间会议室有 %s 条预订" % (
        level, na, nb, ia, ca, ib, cb, run(adm, "SELECT count(*) FROM booking WHERE room = 1 AND slot = 9").fetchone()[0]))
log()

# E3 快照取在 BEGIN，还是第一条查询
adm = my()
run(adm, "DROP TABLE IF EXISTS acc"); run(adm, "CREATE TABLE acc(id int PRIMARY KEY, bal int)"); run(adm, "INSERT INTO acc VALUES (1, 100)")
A = my()
run(A, "SET TRANSACTION ISOLATION LEVEL REPEATABLE READ"); run(A, "START TRANSACTION")
run(adm, "UPDATE acc SET bal = 50 WHERE id = 1")
r = run(A, "SELECT bal FROM acc WHERE id = 1").fetchone()[0]
run(A, "COMMIT")
log("E3 MySQL 可重复读：A 先 START TRANSACTION，别人再改成 50 并提交，A 的第一条 SELECT 读到 %s" % r)
log()

# E4 读已提交下，用 SELECT ... FOR UPDATE 锁住值班的行，挡住写偏斜
adm = pg()
run(adm, "DROP TABLE IF EXISTS doctors"); run(adm, "CREATE TABLE doctors(name text PRIMARY KEY, on_call bool)")
run(adm, "INSERT INTO doctors VALUES ('alice', true), ('bob', true)")
A, B = pg(), pg()
run(A, "BEGIN"); run(B, "BEGIN")
na = len(run(A, "SELECT name FROM doctors WHERE on_call FOR UPDATE").fetchall())
th, box = bg(lambda: len(run(B, "SELECT name FROM doctors WHERE on_call FOR UPDATE").fetchall()))
time.sleep(0.5)
run(A, "UPDATE doctors SET on_call = false WHERE name = 'alice'"); run(A, "COMMIT")
th.join()
run(B, "COMMIT")
log("E4 PostgreSQL 读已提交 + FOR UPDATE：A 锁住并数到 %s 人；B 等了 %.1f 秒，A 提交后 B 数到 %s 人" % (na, box["t"], box["v"]))
try:
    run(adm, "BEGIN"); run(adm, "SELECT count(*) FROM doctors WHERE on_call FOR UPDATE")
except psycopg.Error as e:
    log("E4b PostgreSQL 不允许 count(*) 加 FOR UPDATE：%s" % str(e).splitlines()[0])
run(adm, "ROLLBACK")

with open(__file__.rsplit("/", 1)[0] + "/verify_extra.txt", "w", encoding="utf-8") as f:
    f.write("\n".join(out) + "\n")
