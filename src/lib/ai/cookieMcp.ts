/**
 * cookie-mcp Tool Manifest for Social.wtf
 * Conforms to https://github.com/cookiechain/cookie-mcp
 * Allows AI Agents to interact with Social.wtf on Cookie Chain.
 */

export const SOCIAL_WTF_MCP_TOOLS = [
  {
    name: 'social_wtf_get_creator_profile',
    description: 'Fetch creator mini-app details, storefront products, and widgets on Cookie Chain',
    parameters: {
      type: 'object',
      properties: {
        creatorHandle: {
          type: 'string',
          description: 'The handle of the creator, e.g. cryptobaker or chainsynth',
        },
      },
      required: ['creatorHandle'],
    },
  },
  {
    name: 'social_wtf_tip_creator',
    description: 'Execute on-chain tip in $COOK to a creator with automated 5% fee split to treasury',
    parameters: {
      type: 'object',
      properties: {
        creatorWallet: {
          type: 'string',
          description: 'Recipient Cookie Chain SVM address',
        },
        amountCook: {
          type: 'number',
          description: 'Amount in $COOK to tip',
        },
      },
      required: ['creatorWallet', 'amountCook'],
    },
  },
  {
    name: 'social_wtf_ai_scan_media',
    description: 'Screen an image/video URL using Social.wtf real-time multimodal AI vision',
    parameters: {
      type: 'object',
      properties: {
        mediaUrl: {
          type: 'string',
          description: 'URL of the media asset to evaluate',
        },
      },
      required: ['mediaUrl'],
    },
  },
  {
    name: 'social_wtf_das_query_assets',
    description: 'Query Metaplex Digital Asset Standard (DAS) assets owned by address via api.cookiescan.io',
    parameters: {
      type: 'object',
      properties: {
        ownerAddress: {
          type: 'string',
          description: 'Cookie Chain wallet address to query',
        },
      },
      required: ['ownerAddress'],
    },
  },
];
