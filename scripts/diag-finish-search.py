"""Temporary diagnostic (branch diag/finish-search-20261125 only, never merged): show what each channel's search page returns."""
import importlib.util,datetime as dt,json,re,sys
spec=importlib.util.spec_from_file_location('ff','scripts/refresh-fight-film.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
today=dt.datetime.now(dt.timezone.utc).date()
res=json.load(open('data/results.json'))
plan=m.finish_searches(res,today)
want=('Navajo Stirling','Ky Hodgson','Diyar Nurgozhay')
for (pub,cid,cat,disc),q in plan:
    if not q.startswith(want):continue
    try:
        html=m.fetch_search(cid,q)
    except Exception as e:
        print('FETCH-FAIL',pub,q,type(e).__name__,str(e)[:100]);continue
    has='ytInitialData' in html
    parsed=m.parse_channel_videos(html,pub,cat,disc,today)
    # every video the page lists, before the keyword/recency filter
    ids=re.findall(r'"(?:videoId|contentId)":"([A-Za-z0-9_-]{11})"',html)
    titles=re.findall(r'"title":\{"(?:runs":\[\{"text":|content":)"([^"]{8,120})"',html)
    print('==',pub,'|',q,'| bytes',len(html),'| ytInitialData',has,'| ids',len(set(ids)),'| parsed after filters',len(parsed))
    for t in titles[:8]:print('   page title:',t)
    for v in parsed[:5]:print('   KEPT:',v['date'],v['kind'],v['title'][:90])
