const bcrypt = require('bcryptjs');

async function main() {
  const password = process.argv[2];

  if (!password) {
    console.error('Uso: npm run hash -- "TuPassword"');
    process.exit(1);
  }

  const hash = await bcrypt.hash(password, 12);
  console.log(hash);
}

main().catch((error) => {
  console.error('Error generando hash:', error.message);
  process.exit(1);
});
