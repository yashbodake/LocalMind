import sqlite3

if sqlite3.sqlite_version_info < (3, 35, 0):
    from pysqlite3 import dbapi2 as sqlite3
    import sys
    sys.modules["sqlite3"] = sqlite3
