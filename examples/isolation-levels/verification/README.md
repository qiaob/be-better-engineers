# 实验记录

学习页里标成「已验证」的说法，都来自这里的实验。每个 `.py` 是实验脚本，同名的 `.txt` 是那次运行的输出。

| 文件 | 验证了什么 |
|---|---|
| `verify_pg.py` | PostgreSQL 上的默认级别、快照时机、丢失更新和防法 |
| `verify_mysql.py` | MySQL 上的默认级别、快照时机、可重复读下的「看不到却改得到」 |
| `verify_extra.py` | 补充场景：会议室预订、`FOR UPDATE` 防写偏斜等 |
| `verify_matrix.py` | 两家各跑「4 个级别 × 5 种异常」，结果是演示 4 的两张表 |

运行环境：PostgreSQL 16.15、MySQL 8.0.46，都在本机，库名 `isolation_lab`。每个场景只跑了一种固定的交错顺序，换一种顺序结果可能不同。

重跑需要本机装好两种数据库，以及 Python 的 `psycopg` 和 `pymysql`。
