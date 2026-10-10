const fs = require('fs');
const path = require('path');

class Statement {
  constructor(database, sql) {
    this.database = database;
    this.sql = sql;
  }

  run(...params) {
    this.database.raw.run(this.sql, params);
    this.database.persist();
  }

  get(...params) {
    const stmt = this.database.raw.prepare(this.sql);
    try {
      if (params.length) stmt.bind(params);
      if (!stmt.step()) return undefined;
      return stmt.getAsObject();
    } finally {
      stmt.free();
    }
  }

  all(...params) {
    const stmt = this.database.raw.prepare(this.sql);
    const rows = [];
    try {
      if (params.length) stmt.bind(params);
      while (stmt.step()) rows.push(stmt.getAsObject());
      return rows;
    } finally {
      stmt.free();
    }
  }
}

class ShopDatabase {
  constructor(raw, file) {
    this.raw = raw;
    this.file = file;
    this.inTx = false;
  }

  exec(sql) {
    this.raw.exec(sql);
    this.persist();
  }

  pragma(value) {
    this.exec(`PRAGMA ${value}`);
  }

  prepare(sql) {
    return new Statement(this, sql);
  }

  transaction(fn) {
    return () => {
      this.inTx = true;
      this.raw.exec('BEGIN');
      try {
        const result = fn();
        this.raw.exec('COMMIT');
        this.inTx = false;
        this.persist();
        return result;
      } catch (error) {
        this.inTx = false;
        try {
          this.raw.exec('ROLLBACK');
        } catch {
          /* the transaction is already closed */
        }
        throw error;
      }
    };
  }

  persist() {
    if (this.inTx) return;
    fs.writeFileSync(this.file, Buffer.from(this.raw.export()));
  }
}

async function openDatabase(file) {
  const initSqlJs = require('sql.js');
  const wasmPath = path.join(__dirname, '..', 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm');
  const SQL = await initSqlJs({ wasmBinary: fs.readFileSync(wasmPath) });
  const raw = fs.existsSync(file) ? new SQL.Database(fs.readFileSync(file)) : new SQL.Database();
  return new ShopDatabase(raw, file);
}

module.exports = { openDatabase };
