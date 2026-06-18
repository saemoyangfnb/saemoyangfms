import { Storage } from '@google-cloud/storage';

const storage = new Storage({ projectId: 'gen-lang-client-0562618804' });

const corsConfig = [
  {
    origin: [
      'https://saemoyangfms.vercel.app',
      'https://dalbitgo-calculator.vercel.app',
      'http://localhost:3000',
      'http://localhost:5173',
    ],
    method: ['GET', 'POST', 'PUT', 'DELETE', 'HEAD', 'OPTIONS'],
    responseHeader: ['Content-Type', 'Authorization', 'Content-Length', 'X-Requested-With'],
    maxAgeSeconds: 3600,
  },
];

const bucketName = 'gen-lang-client-0562618804.firebasestorage.app';

async function setCors() {
  await storage.bucket(bucketName).setCorsConfiguration(corsConfig);
  console.log(`CORS set on ${bucketName}`);
  const [meta] = await storage.bucket(bucketName).getMetadata();
  console.log('Current CORS:', JSON.stringify(meta.cors, null, 2));
}

setCors().catch(console.error);
