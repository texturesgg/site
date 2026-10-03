# Security Policy

## Reporting a vulnerability

Email **security@textures.gg** with what you found and how to reproduce it.
Do not open a public issue, pull request, or Discord thread for a suspected
vulnerability.

Include, where you can:

- the affected route, page, or package;
- the steps or request that demonstrate the problem;
- what an attacker gains from it.

Reports about the deployed site (textures.gg and its API) and about the code
in this repository are both in scope. Test against a local copy (see
`README.md`) rather than the live site, and do not access, change, or delete
other people's accounts or uploads.

The parser, renderer, and desktop app live in
[texturesgg/texturesgg](https://github.com/texturesgg/texturesgg); a
vulnerability in how a DAT file is read or drawn belongs there, and the same
address reaches its maintainers.
