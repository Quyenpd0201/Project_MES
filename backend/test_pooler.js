import { Client } from 'pg';

const regions = [
  'ap-southeast-1', // Singapore (Most likely for VN)
  'ap-southeast-2', // Sydney
  'ap-northeast-1', // Tokyo
  'us-east-1',      // N. Virginia
  'us-west-1'       // N. California
];

async function tryConnect(region) {
  const url = `postgresql://postgres.appdjgyubkmhksmynwcb:Mvtho11081002%40@aws-0-${region}.pooler.supabase.com:6543/postgres`;
  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  
  try {
    await client.connect();
    console.log(`✅ Success in region: ${region}`);
    console.log(`URL: ${url}`);
    await client.end();
    return url;
  } catch (err) {
    console.log(`❌ Failed in region ${region}: ${err.message}`);
    return null;
  }
}

async function main() {
  for (const region of regions) {
    const successUrl = await tryConnect(region);
    if (successUrl) {
      console.log('FOUND:', successUrl);
      process.exit(0);
    }
  }
  console.log('NOT_FOUND');
  process.exit(1);
}

main();
