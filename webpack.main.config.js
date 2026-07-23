const path = require('path');

module.exports = {
  cache: false,
  entry: {
    main: './src/main/main.ts',
    preload: './src/main/preload.ts'
  },
  target: 'electron-main',
  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: /node_modules/,
        use: [{ loader: 'ts-loader', options: { configFile: 'tsconfig.main.json' } }]
      },
      {
        // Native .node addons must not be parsed by webpack — pass them through
        // unchanged so Node.js can load them as binary modules at runtime.
        test: /\.node$/,
        loader: 'node-loader'
      }
    ]
  },
  resolve: {
    extensions: ['.ts', '.js']
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].js'
  },
  node: {
    __dirname: false,
    __filename: false
  },
  externals: {
    'better-sqlite3': 'commonjs better-sqlite3',
    'zlib-sync': 'commonjs zlib-sync',
    'bufferutil': 'commonjs bufferutil',
    'utf-8-validate': 'commonjs utf-8-validate',
    // kokoro-js and its entire dependency chain are loaded at runtime via
    // new Function('m','return import(m)')('kokoro-js') inside kokoroService.ts.
    // Mark them as externals so webpack never tries to bundle them.
    'kokoro-js': 'kokoro-js',
    '@huggingface/transformers': '@huggingface/transformers',
    'onnxruntime-node': 'commonjs onnxruntime-node'
  }
};
