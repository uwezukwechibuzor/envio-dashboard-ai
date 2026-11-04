export type UpsellInfo = {
  protocolId: string;
  protocolName: string;
  repoUrl: string | null;
  initCommand: string;
  deployDocsUrl: string;
};

const DEPLOY_DOCS = 'https://docs.envio.dev/docs/HyperIndex/hosted-service';

type IndexerConfig = { repo: string; factoryAddress: string; chainName: string };

const KNOWN_INDEXERS: Record<string, IndexerConfig> = {
  'uniswap-v3': {
    repo: 'https://github.com/envio-dev/uniswap-v3-indexer',
    factoryAddress: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
    chainName: 'ethereum',
  },
  'uniswap-v2': {
    repo: 'https://github.com/envio-dev/uniswap-v2-indexer',
    factoryAddress: '0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f',
    chainName: 'ethereum',
  },
  'uniswap-v4': {
    repo: 'https://github.com/envio-dev/uniswap-v4-indexer',
    factoryAddress: '0x000000000004444c5dc75cB358380D2e3dE08A90',
    chainName: 'ethereum',
  },
  'aave-v3': {
    repo: 'https://github.com/envio-dev/aave-indexer',
    factoryAddress: '0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2',
    chainName: 'ethereum',
  },
};

export function getUpsellInfo(protocolId: string, protocolName: string): UpsellInfo {
  const known = KNOWN_INDEXERS[protocolId];

  if (known) {
    return {
      protocolId,
      protocolName,
      repoUrl: known.repo,
      initCommand: `envio init contract-import \\\n  --name ${protocolId}-indexer \\\n  --contract ${known.factoryAddress} \\\n  --chain ${known.chainName}`,
      deployDocsUrl: DEPLOY_DOCS,
    };
  }

  // Generic fallback
  return {
    protocolId,
    protocolName,
    repoUrl: null,
    initCommand: `envio init contract-import \\\n  --name ${protocolId}-indexer`,
    deployDocsUrl: DEPLOY_DOCS,
  };
}

export function getUpsellsFromSpec(
  widgetQueries: Array<{ args: Record<string, unknown> }>,
  protocolNames: Record<string, string>,
): UpsellInfo[] {
  const protocols = new Set<string>();
  for (const { args } of widgetQueries) {
    if (typeof args['protocol'] === 'string') protocols.add(args['protocol']);
  }
  return Array.from(protocols).map((id) =>
    getUpsellInfo(id, protocolNames[id] ?? id),
  );
}
