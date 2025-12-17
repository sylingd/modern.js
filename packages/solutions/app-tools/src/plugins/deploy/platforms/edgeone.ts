import path from 'node:path';
import {
  ROUTE_SPEC_FILE,
  SERVER_DIR,
  lodash as _,
  fs as fse,
  getMeta,
  removeModuleSyncFromExports,
} from '@modern-js/utils';
import { nodeDepEmit as handleDependencies } from 'ndepe';
import {
  type PluginItem,
  genPluginImportsCode,
  getPluginsCode,
  serverAppContenxtTemplate,
} from '../utils';
import type { CreatePreset } from './platform';

export const createEdgeOnePreset: CreatePreset = (
  appContext,
  modernConfig,
  needModernServer,
) => {
  const { appDirectory, distDirectory, serverPlugins, metaName } = appContext;

  const plugins: PluginItem[] = serverPlugins.map(plugin => [
    plugin.name,
    plugin.options,
  ]);

  const outputDirectory = path.join(appDirectory, '.edgeone');
  const funcsDirectory = path.join(outputDirectory, 'node-functions');
  const entryFilePath = path.join(funcsDirectory, '[[default]].js');
  return {
    async prepare() {
      await fse.remove(outputDirectory);
    },
    async writeOutput() {
      const config: any = {};

      await fse.ensureDir(outputDirectory);

      const staticDirectory = path.join(outputDirectory, 'static');
      await fse.copy(path.join(distDirectory, 'static'), staticDirectory);
      if (!needModernServer) {
        const destHtmlDirectory = path.join(distDirectory, 'html');
        await fse.copy(destHtmlDirectory, outputDirectory);
      } else {
        await fse.copy(distDirectory, funcsDirectory, {
          filter: (src: string) => {
            const distStaticDirectory = path.join(distDirectory, 'static');
            return !src.includes(distStaticDirectory);
          },
        });

        const currentNodeVersion = process.versions.node.split('.')[0];
        const availableVersions = [
          '14.21.3',
          '16.20.2',
          '18.20.4',
          '20.18.0',
          '22.11.0',
        ];
        config.nodeVersion =
          availableVersions.find(x => x.split('.')[0] === currentNodeVersion) ||
          '22.11.0';
      }

      let eoConfig: any = {};
      const eoConfigFilePath = path.join(appDirectory, 'edgeone.json');
      if (await fse.pathExists(eoConfigFilePath)) {
        eoConfig = await fse.readJSON(eoConfigFilePath);
      }
      await fse.writeJSON(
        path.join(outputDirectory, 'edgeone.json'),
        _.merge({}, eoConfig, config),
      );
    },
    async genEntry() {
      if (!needModernServer) {
        return;
      }

      const serverConfig = {
        bff: {
          prefix: modernConfig?.bff?.prefix,
        },
        output: {
          distPath: {
            root: '.',
          },
        },
      };

      const pluginImportCode = genPluginImportsCode(plugins || []);
      const dynamicProdOptions = {
        config: serverConfig,
      };

      const meta = getMeta(metaName);

      const serverConfigPath = `path.join(__dirname, "${SERVER_DIR}", "${meta}.server")`;

      const pluginsCode = getPluginsCode(plugins || []);

      const serverAppContext = serverAppContenxtTemplate(appContext);

      let handlerCode = (
        await fse.readFile(path.join(__dirname, './edgeone-entry.cjs'))
      ).toString();

      handlerCode = handlerCode
        .replace('p_genPluginImportsCode', pluginImportCode)
        .replace('p_ROUTE_SPEC_FILE', `"${ROUTE_SPEC_FILE}"`)
        .replace('p_dynamicProdOptions', JSON.stringify(dynamicProdOptions))
        .replace('p_plugins', pluginsCode)
        .replace('p_serverDirectory', serverConfigPath)
        .replace('p_sharedDirectory', serverAppContext.sharedDirectory)
        .replace('p_apiDirectory', serverAppContext.apiDirectory)
        .replace('p_lambdaDirectory', serverAppContext.lambdaDirectory);

      await fse.writeFile(entryFilePath, handlerCode);
    },
    async end() {
      if (!needModernServer) {
        return;
      }
      await handleDependencies({
        appDir: appDirectory,
        sourceDir: funcsDirectory,
        includeEntries: [
          require.resolve('@modern-js/prod-server'),
          require.resolve('@modern-js/prod-server/edgeone'),
        ],
        copyWholePackage(pkgName) {
          return pkgName === '@modern-js/utils';
        },
        transformPackageJson: ({ pkgJSON }) => {
          if (!pkgJSON.exports || typeof pkgJSON.exports !== 'object') {
            return pkgJSON;
          }

          return {
            ...pkgJSON,
            exports: removeModuleSyncFromExports(
              pkgJSON.exports as Record<string, any>,
            ),
          };
        },
      });
    },
  };
};
