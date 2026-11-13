# Publish a measured result

The canonical table is paper/data/main-results.json. Submit an explicit measured result, including its checkpoint, artifact and evaluation identity.

~~~bash
python tools/publish.py --record /path/to/measured-result.json
python tools/build.py
~~~

Example record, in percentage units:

~~~json
{"row":"Ours (measured peak)","column":"dbbench","mean":70.56,"sd":0.38,
 "checkpoint":"v35","artifact":"harnesses/dbbench/20261026-l4-h0-sol61-v35",
 "evaluation":"three complete executions","source":"recorded evaluation identifier"}
~~~

The current manuscript uses the four columns alfworld, dbbench, webshop and osbench. The dated 2026-11-11 archive retains separate historical and frozen WebShop columns. Existing measurements remain in paper/data/publication-history.json. Add new PDFs and previews to paper/figures.json. Commit the matching configurations, numeric records and artifacts, then push. GitHub Actions deploys the site.

Peak and development-selected rows retain their separate identities. Update README summary values alongside any intentional change to the paper's main table.
