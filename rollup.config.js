import nodeResolve from 'rollup-plugin-node-resolve';

export default {
  entry: 'app.js',
  dest: 'bundle.js',
  format: 'iife',
  plugins: [
    nodeResolve({ jsnext: true }),
  ],
};
