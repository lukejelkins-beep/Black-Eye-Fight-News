import json,re,time,urllib.request,concurrent.futures as cf,datetime
from bs4 import BeautifulSoup
UA={"User-Agent":"Mozilla/5.0"}
f=json.load(open("fights_2025.json"))
urls=sorted({x[k] for x in f for k in("a_url","b_url") if x[k]})
M={m:i+1 for i,m in enumerate("Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split())}
def one(u):
    for a in range(3):
        try:
            h=urllib.request.urlopen(urllib.request.Request("https://www.sherdog.com"+u,headers=UA),timeout=30).read().decode("utf8","ignore")
            s=BeautifulSoup(h,"lxml"); rows=[]
            for tr in s.select(".module.fight_history table tr"):
                r=tr.select_one(".final_result"); d=tr.select_one(".sub_line")
                if not r or not d: continue
                m=re.match(r"(\w{3}) / (\d+) / (\d{4})",d.get_text(strip=True))
                if not m: continue
                rows.append((f"{m[3]}-{M[m[1]]:02d}-{int(m[2]):02d}",r.get_text(strip=True)))
            return u,rows
        except Exception: time.sleep(2)
    return u,None
out={}
with cf.ThreadPoolExecutor(4) as ex:
    for i,(u,r) in enumerate(ex.map(one,urls)):
        out[u]=r; time.sleep(0.2)
json.dump(out,open("hist.json","w"))
print(len(out),sum(1 for v in out.values() if v is None),"failed")
