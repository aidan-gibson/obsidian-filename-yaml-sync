# TODO:
* rewrite from scratch with the [plugin template obsid provides](https://github.com/obsidianmd/obsidian-sample-plugin).

* all it has to do is:
  * Confirm YAML opener and closer exist with `title: """` inside (but title should be replaceable in plugin settings)
  should be more flexible and not as strict
* should be configurable so assign ANY element in the doc to filename automatically (why not? It'll get me comfy w obsidian API. maybe I should wait until they finalize the API more?)
* if you try to name a file "foo" but "foo" already exists, the obsidian dev console will say "Error: Dest file already exists!" but nothing will happen visibly without the dev console open. Maybe I should make a popup, like "that filename already exists in this directory, pick something else" etc

# This program expects, at the very minimum:
```
---
title: "sampleTitle"
```
But I built it to work with the following:
```
---
layout: note
title: "sampleTitle"
date:   2022-03-13 19:10:06
---
```
***
This code is a fugly hack [dvcrn's repo](https://github.com/dvcrn/obsidian-filename-heading-sync/tree/e301aa40b709fabe5ac43b62cfcafa8192fccd21); exact same behavior but for the first heading in the file instead of the YAML title. They deserve all credit.


MIT licensing.


