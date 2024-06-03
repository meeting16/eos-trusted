const sqlite3 = require('sqlite3').verbose();

// 打开数据库
let db = new sqlite3.Database('./proofs.db', sqlite3.OPEN_READONLY, (err) => {
  if (err) {
    console.error(err.message);
  }
  console.log('Connected to the proofs.db database.');
});

// 查询所有内容
db.serialize(() => {
  db.each(`SELECT * FROM proofs`, (err, row) => {
    if (err) {
      console.error(err.message);
    }
    console.log(row);
  });
});

// 关闭数据库
db.close((err) => {
  if (err) {
    console.error(err.message);
  }
  console.log('Close the database connection.');
});
