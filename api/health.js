const crypto = require('../license-server/src/crypto');
const db = require('../license-server/src/database');

module.exports = async (req, res) => {
  try {
    await db.ready();
    res.json({
      status: 'ok',
      service: 'XDM Turbo Central Licensing System',
      version: '2.0.0',
      database: db.isTurso ? 'turso_cloud' : 'sqlite_file',
      publicKey: crypto.getPublicKey(),
      time: Date.now()
    });
  } catch (err) {
    res.status(500).json({ status: 'error', error: err.message });
  }
};
