import { createServerBase } from '@modern-js/server-core';
import {
  loadServerCliConfig,
  loadServerEnv,
  loadServerRuntimeConfig,
} from '@modern-js/server-core/node';
import { applyPlugins } from './apply';
import type { BaseEnv, ProdServerOptions } from './types';

export type { ProdServerOptions, BaseEnv } from './types';

interface EOEventContext {
  uuid: string;
  params: any;
  request: Request;
  env: Record<string, unknown>;
  clientIp: string;
  server: {
    region: string;
    requestId: string;
  };
  geo: any;
}

export const createEdgeOneFunction = async (options: ProdServerOptions) => {
  await loadServerEnv(options);

  const serverBaseOptions = options;

  const serverCliConfig = loadServerCliConfig(options.pwd, options.config);

  if (serverCliConfig) {
    options.config = serverCliConfig;
  }

  const serverRuntimeConfig = await loadServerRuntimeConfig(
    options.serverConfigPath,
  );

  if (serverRuntimeConfig) {
    serverBaseOptions.serverConfig = serverRuntimeConfig;
    serverBaseOptions.plugins = [
      ...(serverRuntimeConfig.plugins || []),
      ...(options.plugins || []),
    ];
  }
  const server = createServerBase<BaseEnv>(serverBaseOptions);

  await applyPlugins(server, options);
  await server.init();
  return (ctx: EOEventContext) => {
    return server.handle(ctx.request, {
      env: ctx.env,
      clientIp: ctx.clientIp,
      server: ctx.server,
      geo: ctx.geo,
    });
  };
};
