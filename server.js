const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const { exec } = require('child_process');
const path = require('path');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();

// EOSIO 节点配置
const rpcUrl = 'http://10.122.202.37:8888';

const app = express();
app.use(bodyParser.json());

// 配置 CORS
var corsOptions = {
  origin: 'http://10.21.133.46:8080',
  optionsSuccessStatus: 200
};
app.use(cors(corsOptions));

// 设置 Content-Security-Policy
app.use((req, res, next) => {
  res.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self' 'unsafe-inline' cdnjs.cloudflare.com; style-src 'self' 'unsafe-inline';");
  return next();
});

// 提供静态文件
app.use(express.static(path.join(__dirname, 'public')));

// 打开user.db数据库
let userDb = new sqlite3.Database('./users.db', (err) => {
  if (err) {
    console.error(err.message);
  }
  console.log('Connected to the users database.');
});

// 打开 proof.db 数据库
let proofDb = new sqlite3.Database('./proofs.db', (err) => {
  if (err) {
    console.error(err.message);
  }
  console.log('Connected to the proofs database.');
});


async function createKey() {
  return new Promise((resolve, reject) => {
    exec('cleos wallet create_key', (error, stdout, stderr) => {
      if (error) {
        reject(`Error: ${error.message}`);
        return;
      }
      if (stderr) {
        reject(`Stderr: ${stderr}`);
        return;
      }
      const key = stdout.trim().match(/"(\w+)"/)[1]; // 提取公钥
      resolve(key);
    });
  });
}

function createAccount(username, publicKey) {
  return new Promise((resolve, reject) => {
    exec(`cleos --url ${rpcUrl} create account eosio ${username} ${publicKey}`, (error, stdout, stderr) => {
      if (stderr.includes('executed transaction')) {
        resolve({ success: true, message: 'User created successfully' });
        return;
      }
      if (stderr.includes('name is already taken')) {
        resolve({ success: false, message: 'Username already exists' });
        return;
      }
      if (error) {
        reject(`Error: ${error.message}`);
        return;
      }
      if (stderr) {
        reject(`Stderr: ${stderr}`);
        return;
      }
      reject('Unknown error');
    });
  });
}

// 用户注册
app.post('/register', async (req, res) => {
  const { username, passwordHash } = req.body;
	console.log(username);
	console.log(passwordHash);
  try {
    const publicKey = await createKey();
    console.log(publicKey);
    
    const accountResult = await createAccount(username, publicKey);
    if (accountResult.success) {
      // 将用户数据插入到数据库中
      userDb.run(`INSERT INTO users (username, password_hash, public_key, num) VALUES (?, ?, ?, ?)`,
        [username, passwordHash, publicKey, 0],
        function(err) {
          if (err) {
            console.error(err); // 打印错误信息
            res.status(500).json({ success: false, message: 'Error inserting user into database' });
            return;
          }
          res.json({ success: true, publicKey, message: accountResult.message });
        }
      );
    } else {
      res.json({ success: false, message: accountResult.message });
    }
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).send('Error creating user');
  }
});

// 用户登录
app.post('/login', (req, res) => {
  const { username, passwordHash} = req.body;
  console.log(username);
  console.log(passwordHash);
  userDb.get(`SELECT * FROM users WHERE username = ?`, [username], async (err, row) => {
    if (err) {
      return res.status(400).json({ error: err.message });
    }
    if (row && passwordHash === row.password_hash) {
      res.json({
        message: 'Login successful',
        username: row.username,
        public_key: row.public_key,
        created_at: row.created_at,
        num: row.num
      });
    } else {
      res.status(400).json({ message: 'Invalid username or password' });
    }
  });
});

// proof
app.post('/upload', async (req, res) => {
  const { user, title, content, datahash } = req.body;
  console.log(title);
  console.log(content);

  try {
    const info = await axios.get(`${rpcUrl}/v1/chain/get_info`);
    const blockId = info.data.head_block_id;
    const block_num = info.data.head_block_num;

    exec(`cleos --url ${rpcUrl} push action hello5 addproof '["${user}", "${datahash}", ${block_num}, "${blockId}"]' -p ${user}@active`,  { maxBuffer: 1024 * 1024 },(error, stdout, stderr) => {
      if (stderr.includes('executed transaction')) {
        const transactionId = stderr.trim().split(' ')[2]; // 提取交易ID
        
        // 获取新添加的 proof_id
        exec(`cleos --url ${rpcUrl} get table hello5 hello5 proofs -l 1 --reverse`, (error, stdout, stderr) => {
          if (error) {
            console.error(`Error getting proof id: ${error.message}`);
            res.status(500).send('Error getting proof id');
            return;
          }
          const proofData = JSON.parse(stdout);
          console.log(proofData);
          const proofId = proofData.rows[0].id;
          const timestamp = proofData.rows[0].timestamp;
          
          // 将数据插入到 proofs 数据库
          proofDb.run(`INSERT INTO proofs (proof_id, username, title, content, datahash, block_num, block_id, transaction_id, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [proofId, user, title, content, datahash, block_num, blockId, transactionId, timestamp],
            function(err) {
              if (err) {
                console.error(err); // 打印错误信息
                res.status(500).json({ success: false, message: 'Error inserting proof into database' });
                return;
              }
              
              // 更新 users 数据库中的 num 列
              userDb.run(`UPDATE users SET num = num + 1 WHERE username = ?`, [user], function(err) {
                if (err) {
                  console.error(err); // 打印错误信息
                  res.status(500).json({ success: false, message: 'Error updating user num in database' });
                  return;
                }
              res.json({ success: true, proof_id: proofId, datahash: datahash, block_id: blockId });
             });
            }
          );
        });
      } else {
        if (error) {
          console.error(`Error uploading data hash: ${error.message}`);
          res.status(500).send('Error uploading data hash');
          return;
        }
        if (stderr) {
          console.error(`Stderr: ${stderr}`);
          res.status(500).send('Error uploading data hash');
          return;
        }
      }
    });
  } catch (error) {
    console.error('Error uploading data hash:', error);
    res.status(500).send('Error uploading data hash');
  }
});

// 根据上链 ID 查询交易信息
app.get('/transaction/:id', (req, res) => {
  const id = req.params.id;
  console.log(id);
  proofDb.get(`SELECT * FROM proofs WHERE proof_id = ?`, [id], (err, row) => {
  console.log(row);
    if (err) {
      res.status(500).json({ error: 'Error retrieving transaction from database' });
      return;
    }
    if (!row) {
      res.status(404).json({ error: 'Transaction not found' });
      return;
    }
    res.json(row); // 将检索到的信息发送到前端
  });
});

// 根据区块 ID 查询交易信息
app.get('/block/:id', (req, res) => {
  const id = req.params.id;
  console.log(id);
  proofDb.get(`SELECT * FROM proofs WHERE block_id = ?`, [id], (err, row) => {
  console.log(row);
    if (err) {
      console.error(err.message);
      res.status(500).json({ error: 'Error retrieving transactions from database' });
      return;
    }/*
    if (rows.length === 0) {
      res.status(404).json({ error: 'Transactions not found for the given block ID' });
      return;
    }*/
        if (!row) {
      res.status(404).json({ error: 'Transaction not found' });
      return;
    }
    res.json(row); // 将检索到的交易信息数组发送到前端
  });
});

// 数据检验
app.post('/check', (req, res) => {
  const { id, datahash } = req.body;4
  console.log(id);
  console.log(datahash);

  // 从数据库中检索存证信息
  proofDb.get(`SELECT datahash FROM proofs WHERE proof_id = ?`, [id], (err, row) => {
    if (err) {
      console.error(`Error retrieving datahash from database: ${err.message}`);
      res.status(500).send('Error retrieving datahash from database');
      return;
    }
    if (!row) {
      res.status(404).json({ success: false, message: 'Proof not found' });
      return;
    }

    // 比较数据库中的数据哈希与提供的数据哈希
    if (row.datahash === datahash) {
      res.json({ success: true, message: 'Data hash is valid.' });
    } else {
      res.json({ success: false, message: 'Data hash is invalid.' });
    }
  });
});


// 从数据库中检索所有存证数据
app.get('/proofs', (req, res) => {
  proofDb.all(`SELECT * FROM proofs`, [], (err, rows) => {
    if (err) {
      console.error(err.message);
      res.status(500).json({ error: 'Error retrieving proofs from database' });
      return;
    }
    res.json(rows); // 将检索到的数据发送到前端
  });
});

// 默认路由
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(3000, () => {
  console.log('Server is running on port 3000');
});

