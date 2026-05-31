import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';
import fs from 'fs';

// Simple in-memory log store for real-time Web UI polling
const androidLogs: Array<{ time: string; level: string; tag: string; message: string }> = [];

export default defineConfig(() => {
  return {
    plugins: [
      react(), 
      tailwindcss(),
      {
        name: 'remote-logs-collector',
        configureServer(server) {
          server.middlewares.use((req, res, next) => {
            // POST Endpoint to receive logs from Android
            if (req.url === '/api/logs' && req.method === 'POST') {
              let body = '';
              req.on('data', chunk => {
                body += chunk;
              });
              req.on('end', () => {
                try {
                  const logData = JSON.parse(body);
                  const timeStr = new Date().toLocaleTimeString('en-US', { hour12: false });
                  const newLog = {
                    time: timeStr,
                    level: logData.level || 'INFO',
                    tag: logData.tag || 'ANDROID',
                    message: logData.message || ''
                  };
                  
                  androidLogs.push(newLog);
                  if (androidLogs.length > 200) {
                    androidLogs.shift();
                  }

                  // Print to terminal console
                  console.log(`\x1b[33m[ANDROID][${newLog.level}][${newLog.tag}]\x1b[0m ${newLog.message}`);

                  // Append to a local file in standard workspace directory
                  const logLine = `[${new Date().toISOString()}] [${newLog.level}] [${newLog.tag}] ${newLog.message}\n`;
                  fs.appendFileSync(path.join(process.cwd(), 'android_crash_logs.txt'), logLine);
                } catch (e: any) {
                  console.error('Failed parsing received Android crash logs:', e.message);
                }
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ status: 'ok' }));
              });
              return;
            }

            // GET Endpoint for the React interface to pull device log session
            if (req.url === '/api/logs' && req.method === 'GET') {
              res.writeHead(200, { 
                'Content-Type': 'application/json',
                'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate' 
              });
              res.end(JSON.stringify({ logs: androidLogs }));
              return;
            }

            next();
          });
        }
      }
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
