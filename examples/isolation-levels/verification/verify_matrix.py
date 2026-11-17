"""把「四个级别 × 五种异常」在 PostgreSQL 和 MySQL 上各跑一遍，结果写进 verify_matrix.json 和 verify_matrix.txt。

每个事务是一个独立的线程，按固定的交错顺序收到语句；一条语句 0.6 秒内没返回，就记为「在等锁」，
主线程接着给另一个事务发下一条，和真实的并发一样。某个事务报错后立即 ROLLBACK，后面的语句不再执行。
用法：python verify_matrix.py
"""
import json
import queue
import threading

import psycopg
import pymysql
import pymysql.constants.CLIENT

STOP = object()  # 让事务线程退出的信号
LEVELS = ["READ UNCOMMITTED", "READ COMMITTED", "REPEATABLE READ", "SERIALIZABLE"]


def pg():
    return psycopg.connect("dbname=isolation_lab", autocommit=True)


def my():
    c = pymysql.connect(unix_socket="/var/run/mysqld/mysqld.sock", user="root", database="isolation_lab",
                        autocommit=True, client_flag=pymysql.constants.CLIENT.FOUND_ROWS)
    c.cursor().execute("SET SESSION innodb_lock_wait_timeout = 5")
    return c


DBS = {
    "PostgreSQL": {"connect": pg, "begin": lambda lv: ["BEGIN ISOLATION LEVEL " + lv]},
    "MySQL": {"connect": my, "begin": lambda lv: ["SET TRANSACTION ISOLATION LEVEL " + lv, "START TRANSACTION"]},
}


class Session(threading.Thread):
    def __init__(self, name, conn, res):
        super().__init__(daemon=True)
        self.name, self.conn, self.res = name, conn, res
        self.q = queue.Queue()
        self.aborted = False
        self.start()

    def submit(self, key, sql):
        done = threading.Event()
        self.q.put((key, sql, done))
        return done

    def run(self):
        while True:
            key, sql, done = self.q.get()
            if sql is STOP:
                done.set()
                return
            if self.aborted:
                done.set()
                continue
            try:
                text = sql(self.res) if callable(sql) else sql
                cur = self.conn.cursor()
                cur.execute(text)
                if key:
                    self.res[key] = cur.fetchone()[0] if cur.description else cur.rowcount
            except Exception as e:  # noqa: BLE001  记录任何数据库错误
                code = getattr(e, "sqlstate", None) or (e.args[0] if e.args else "?")
                self.res.setdefault("errors", []).append("%s 的「%s」报错 %s" % (self.name, text, code))
                self.aborted = True
                try:
                    self.conn.cursor().execute("ROLLBACK")
                except Exception:  # noqa: BLE001
                    pass
            done.set()

    def stop(self):
        self.submit(None, STOP).wait(15)


def reset(c):
    cur = c.cursor()
    for t in ["acc", "item", "orders", "doctors"]:
        cur.execute("DROP TABLE IF EXISTS " + t)
    cur.execute("CREATE TABLE acc(id int PRIMARY KEY, bal int)")
    cur.execute("INSERT INTO acc VALUES (1, 100)")
    cur.execute("CREATE TABLE item(id int PRIMARY KEY, stock int)")
    cur.execute("INSERT INTO item VALUES (1, 10)")
    cur.execute("CREATE TABLE orders(id int PRIMARY KEY, amount int)")
    cur.execute("INSERT INTO orders VALUES (1, 50), (2, 150), (3, 300)")
    cur.execute("CREATE TABLE doctors(name varchar(20) PRIMARY KEY, on_call boolean)")
    cur.execute("INSERT INTO doctors VALUES ('alice', true), ('bob', true)")


def scenario(kind, begin):
    """返回 [(事务, 结果键, 语句)]。"""
    A, B = "A", "B"
    s = []
    b = lambda who: [(who, None, x) for x in begin]  # noqa: E731
    if kind == "dirty":
        s += b(B) + [(B, None, "UPDATE acc SET bal = 50 WHERE id = 1")]
        s += b(A) + [(A, "r", "SELECT bal FROM acc WHERE id = 1"), (B, None, "ROLLBACK"), (A, None, "COMMIT")]
    elif kind == "nonrepeatable":
        s += b(A) + [(A, "r1", "SELECT bal FROM acc WHERE id = 1")]
        s += b(B) + [(B, None, "UPDATE acc SET bal = 50 WHERE id = 1"), (B, None, "COMMIT")]
        s += [(A, "r2", "SELECT bal FROM acc WHERE id = 1"), (A, None, "COMMIT")]
    elif kind == "phantom":
        s += b(A) + [(A, "n1", "SELECT count(*) FROM orders WHERE amount > 100")]
        s += b(B) + [(B, None, "INSERT INTO orders VALUES (4, 200)"), (B, None, "COMMIT")]
        s += [(A, "n2", "SELECT count(*) FROM orders WHERE amount > 100"), (A, None, "COMMIT")]
    elif kind == "lost":
        s += b(A) + b(B)
        s += [(A, "a", "SELECT stock FROM item WHERE id = 1"), (B, "b", "SELECT stock FROM item WHERE id = 1"),
              (A, None, lambda r: "UPDATE item SET stock = %d WHERE id = 1" % (r["a"] - 1)), (A, None, "COMMIT"),
              (B, None, lambda r: "UPDATE item SET stock = %d WHERE id = 1" % (r["b"] - 1)), (B, None, "COMMIT")]
    elif kind == "skew":
        s += b(A) + b(B)
        s += [(A, "na", "SELECT count(*) FROM doctors WHERE on_call"), (B, "nb", "SELECT count(*) FROM doctors WHERE on_call"),
              (A, None, "UPDATE doctors SET on_call = false WHERE name = 'alice'"),
              (B, None, "UPDATE doctors SET on_call = false WHERE name = 'bob'"),
              (A, None, "COMMIT"), (B, None, "COMMIT")]
    return s


def judge(kind, res, waited, final):
    err = res.get("errors")
    if kind == "dirty":
        bad = res.get("r") == 50
    elif kind == "nonrepeatable":
        bad = "r2" in res and res.get("r1") != res.get("r2")
    elif kind == "phantom":
        bad = "n2" in res and res.get("n1") != res.get("n2")
    elif kind == "lost":
        bad = not err and final == 9
    else:
        bad = not err and final == 0
    if bad:
        return "会"
    if err:
        return "报错"
    if waited:
        return "等锁"
    return "挡住"


def main():
    matrix, lines = {}, []
    for dbname, db in DBS.items():
        admin = db["connect"]()
        matrix[dbname] = {}
        for lv in LEVELS:
            row = {}
            for kind in ["dirty", "nonrepeatable", "phantom", "lost", "skew"]:
                reset(admin)
                res = {}
                sess = {"A": Session("A", db["connect"](), res), "B": Session("B", db["connect"](), res)}
                waited = []
                for who, key, sql in scenario(kind, db["begin"](lv)):
                    if not sess[who].submit(key, sql).wait(0.6):
                        waited.append(who + "：" + (sql if isinstance(sql, str) else "UPDATE …"))
                for x in sess.values():
                    x.stop()
                cur = admin.cursor()
                if kind == "lost":
                    cur.execute("SELECT stock FROM item WHERE id = 1")
                elif kind == "skew":
                    cur.execute("SELECT count(*) FROM doctors WHERE on_call")
                else:
                    cur.execute("SELECT 0")
                final = cur.fetchone()[0]
                verdict = judge(kind, res, waited, final)
                row[kind] = verdict
                detail = {k: v for k, v in res.items() if k != "errors"}
                lines.append("%-10s %-16s %-13s → %s   读到 %s；最终 %s；等锁 %s；报错 %s" % (
                    dbname, lv, kind, verdict, detail, final, waited or "无", res.get("errors") or "无"))
            matrix[dbname][lv] = row
        lines.append("")
    base = __file__.rsplit("/", 1)[0]
    with open(base + "/verify_matrix.json", "w", encoding="utf-8") as f:
        json.dump(matrix, f, ensure_ascii=False, indent=1)
    with open(base + "/verify_matrix.txt", "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")
    print("\n".join(lines))
    print(json.dumps(matrix, ensure_ascii=False))


main()
