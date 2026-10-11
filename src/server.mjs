import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import {
  localhostHostValidation,
  localhostOriginValidation,
  toNodeHandler
} from '@modelcontextprotocol/node';

import { createVoiceGuardHandler } from './mcp_server.mjs';

const publicDirectory = fileURLToPath(new URL('../public/', import.meta.url));
const knownTools = new Set([
  'evaluate_voice_action',
  'resolve_voice_confirmation',
  'get_voiceguard_audit'
]);
const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml'
};

function writeJson(response, status, value) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  response.end(JSON.stringify(value));
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 32 * 1024) throw new Error('Request body exceeds 32 KB');
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

function parseToolResult(result) {
  const text = result.content?.find((item) => item.type === 'text')?.text;
  if (!text) return result;
  try {
    return JSON.parse(text);
  } catch {
    return { text };
  }
}

async function withMcpClient(mcpUrl, operation) {
  const client = new Client({ name: 'voiceguard-simulator', version: '1.0.0' });
  const transport = new StreamableHTTPClientTransport(new URL(mcpUrl));
  await client.connect(transport);
  try {
    return await operation(client);
  } finally {
    await client.close();
  }
}

async function serveStatic(pathname, response) {
  const requested = pathname === '/' ? 'index.html' : pathname.slice(1);
  const safeRelative = normalize(requested).replace(/^(\.\.[/\\])+/, '');
  const filePath = join(publicDirectory, safeRelative);
  if (!filePath.startsWith(publicDirectory)) {
    writeJson(response, 403, { error: 'Forbidden' });
    return;
  }
  try {
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) throw new Error('Not a file');
    response.writeHead(200, {
      'Content-Type': mimeTypes[extname(filePath)] ?? 'application/octet-stream',
      'Content-Length': fileStat.size,
      'X-Content-Type-Options': 'nosniff'
    });
    createReadStream(filePath).pipe(response);
  } catch {
    writeJson(response, 404, { error: 'Not found' });
  }
}

export function startVoiceGuardServer({ port = 8787, host = '127.0.0.1' } = {}) {
  const mcpHandler = createVoiceGuardHandler();
  const nodeMcpHandler = toNodeHandler(mcpHandler);
  const validateHost = localhostHostValidation();
  const validateOrigin = localhostOriginValidation();

  const httpServer = createServer(async (request, response) => {
    try {
      if (!validateHost(request, response) || !validateOrigin(request, response)) return;
      const baseUrl = `http://${request.headers.host ?? `${host}:${port}`}`;
      const url = new URL(request.url ?? '/', baseUrl);

      if (url.pathname === '/mcp') {
        await nodeMcpHandler(request, response);
        return;
      }

      if (request.method === 'GET' && url.pathname === '/health') {
        writeJson(response, 200, {
          status: 'ok',
          project: 'VoiceGuard MCP',
          mcpEndpoint: '/mcp',
          protocol: 'MCP 2026-07-28 via Streamable HTTP',
          simulationOnly: true
        });
        return;
      }

      if (request.method === 'GET' && url.pathname === '/api/tools') {
        const result = await withMcpClient(`${baseUrl}/mcp`, (client) => client.listTools());
        writeJson(response, 200, result);
        return;
      }

      if (request.method === 'POST' && url.pathname === '/api/call') {
        const body = await readJson(request);
        if (!knownTools.has(body.name)) {
          writeJson(response, 400, { error: 'Unknown tool' });
          return;
        }
        const result = await withMcpClient(`${baseUrl}/mcp`, (client) =>
          client.callTool({ name: body.name, arguments: body.arguments ?? {} })
        );
        writeJson(response, 200, parseToolResult(result));
        return;
      }

      if (request.method === 'GET') {
        await serveStatic(url.pathname, response);
        return;
      }

      writeJson(response, 405, { error: 'Method not allowed' });
    } catch (error) {
      writeJson(response, 500, { error: error instanceof Error ? error.message : 'Unexpected error' });
    }
  });

  return new Promise((resolve, reject) => {
    httpServer.once('error', reject);
    httpServer.listen(port, host, () => {
      const address = httpServer.address();
      const actualPort = typeof address === 'object' && address ? address.port : port;
      resolve({
        server: httpServer,
        mcpHandler,
        url: `http://${host}:${actualPort}`,
        async close() {
          await mcpHandler.close();
          await new Promise((done, fail) => httpServer.close((error) => (error ? fail(error) : done())));
        }
      });
    });
  });
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const port = Number(process.env.PORT ?? 8787);
  const running = await startVoiceGuardServer({ port });
  console.log(`VoiceGuard MCP simulation running at ${running.url}`);

  const shutdown = async () => {
    await running.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
