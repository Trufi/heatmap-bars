const ForkTsCheckerWebpackPlugin = require('fork-ts-checker-webpack-plugin');
const path = require('path');

module.exports = (env) => {
    const mode = env.production ? 'production' : 'development';

    return {
        mode,

        module: {
            rules: [
                {
                    test: /(\.ts|\.tsx)$/,
                    exclude: /node_modules/,
                    use: {
                        loader: 'ts-loader',
                        options: {
                            transpileOnly: true,
                        },
                    },
                },
            ],
        },

        resolve: {
            extensions: ['.ts', '.js'],
        },

        entry: './demo/index.ts',

        output: {
            filename: 'index.js',
            path: path.resolve(__dirname, 'demo/dist'),
            publicPath: '/dist',
        },

        plugins: [new ForkTsCheckerWebpackPlugin()],

        devtool: mode === 'production' ? false : 'source-map',

        devServer: {
            host: '0.0.0.0',
            port: 3000,
            allowedHosts: 'all',
            client: {
                overlay: false,
            },
            static: {
                directory: path.join(__dirname, 'demo/public'),
            },
        },
    };
};
