# Kaitai Struct: runtime library for TypeScript

[![npm@latest](https://img.shields.io/npm/v/@tschrock/kaitai-struct/latest)](https://www.npmjs.com/package/@tschrock/kaitai-struct/v/latest)
[![npm@next](https://img.shields.io/npm/v/@tschrock/kaitai-struct/next)](https://www.npmjs.com/package/@tschrock/kaitai-struct/v/next)
[![downloads](https://img.shields.io/npm/dw/@tschrock/kaitai-struct)](https://www.npmtrends.com/@tschrock/kaitai-struct)

This library implements Kaitai Struct API for TypeScript.

Kaitai Struct is a declarative language used for describe various binary
data structures, laid out in files or in memory: i.e. binary file
formats, network stream packet formats, etc.

Further reading:

* [About Kaitai Struct](http://kaitai.io/)
* [About API implemented in this library](http://doc.kaitai.io/stream_api.html)
* [JavaScript-specific notes](http://doc.kaitai.io/lang_javascript.html) - also includes Quick start guide

## Installation

The code generated by the kaitai compiler directly imports the runtime as `kaitai-struct`, so in order to use the typescript runtime, you'll have to install it as an alias:

```
$ npm install kaitai-struct@npm:@tschrock/kaitai-struct
```

This installs the `@tschrock/kaitai-struct` package under the alias `kaitai-struct`

## Licensing

Copyright 2012-2016 Ilmari Heikkinen
Copyright 2016-2020 Kaitai Project

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.