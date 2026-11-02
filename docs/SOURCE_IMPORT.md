# Initial game source import

The GitHub repository initially contained README.md and the Apache-2.0 LICENSE at commit `eb630f7ffb5851d5c65c8ca33237db21776b25b4`. This branch preserves that history and license.

The game baseline is the existing public AFTER//ZERO v0.3.1 source export, from Sites source commit `8d91d199d87a5d528601fbf51bd27467c83e5e36`.

- Source URL: https://afterzero-cyberpunk-fps.trent-slade.chatgpt.site/afterzero-source.zip
- Original archive SHA-256: `7e164b9df94dd5cb2489a0419f2fd646009ef5c398f1d91eda1e889d2df1adc9`
- The export omits deployment identity, credentials, database contents, build output and dependency installations.
- The checked-in source archive is regenerated from the final branch, so it has a different hash from the baseline above.

Original campaign, game, rendering, navigation and arena simulation modules are retained. The additional work provides the standalone Render HTTP/SQLite adapter, bounded public entry point, configurable arena endpoint, deployment specification, documentation and tests. `public/NOTICE` preserves QUICKSCOPER attribution.
