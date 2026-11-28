import json,re,time,urllib.request,concurrent.futures as cf
from bs4 import BeautifulSoup
UA={"User-Agent":"Mozilla/5.0"}
f=json.load(open("fights_2025.json"))
urls=sorted({x[k] for x in f for k in("a_url","b_url") if x[k]})
def one(u):
    for a in range(3):
        try:
            h=urllib.request.urlopen(urllib.request.Request("https://www.sherdog.com"+u,headers=UA),timeout=30).read().decode("utf8","ignore")
            s=BeautifulSoup(h,"lxml")
            assoc=[a.get_text(strip=True) for a in s.select('a[href*="fightfinder?association="] span, [itemprop=memberOf] span[itemprop=name]')]
            seen=[]
            [seen.append(x) for x in assoc if x and x not in seen]
            return u,{"gyms":seen}
        except Exception as e:
            time.sleep(2)
    return u,{"gyms":None}
out={}
with cf.ThreadPoolExecutor(4) as ex:
    for i,(u,r) in enumerate(ex.map(one,urls)):
        out[u]=r
        time.sleep(0.2)
        if i%100==0: print(i,flush=True)
json.dump(out,open("gyms.json","w"),indent=1)
print(sum(1 for v in out.values() if v["gyms"]),"with gym of",len(out), sum(1 for v in out.values() if v["gyms"] is None),"failed")
