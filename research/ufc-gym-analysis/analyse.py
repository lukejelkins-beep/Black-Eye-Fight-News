import json,math,random,collections,sys
import numpy as np
from scipy.optimize import minimize
files=sys.argv[1:] or ["fights_2025.json"]; LABEL="_".join(x.split("_")[-1].split(".")[0] for x in files)
f=[x for fn in files for x in json.load(open(fn))]; H=json.load(open("hist.json")); G=json.load(open("gyms.json"))
def pre(u,d):
    w=l=0
    for dd,r in H[u]:
        if dd<d:
            if r=="win": w+=1
            elif r=="loss": l+=1
    return w,l
def lg(w,l): 
    p=(w+1)/(w+l+2); return math.log(p/(1-p))
rows=[]
for x in f:
    if (x["a_res"],x["b_res"])!=("win","loss") and (x["a_res"],x["b_res"])!=("loss","win"): pass
    if x["a_res"] not in("win","loss") or x["b_res"] not in("win","loss") or x["a_res"]==x["b_res"]: continue
    wa,la=pre(x["a_url"],x["date"]); wb,lb=pre(x["b_url"],x["date"])
    if wa+la==0 or wb+lb==0: pass
    rows.append(dict(a=x["a_url"],b=x["b_url"],y=1 if x["a_res"]=="win" else 0,d=lg(wa,la)-lg(wb,lb),ea=wa+la,eb=wb+lb,date=x["date"]))
n=len(rows); y=np.array([r["y"] for r in rows]); d=np.array([r["d"] for r in rows])
# symmetric logistic with no intercept (ordering of a/b is arbitrary)
def nll(k): 
    z=k[0]*d; return -np.sum(y*z-np.log1p(np.exp(z)))
k=minimize(nll,[0.5]).x[0]
p=1/(1+np.exp(-k*d))
base=-np.sum(y*np.log(p)+(1-y)*np.log(1-p)); null=n*math.log(2)
print(f"bouts {n}; slope {k:.3f}; logloss model {base/n:.4f} vs coin {null/n:.4f}; hit rate {np.mean((p>.5)==(y==1)):.3f}")
gy={u:set(v["gyms"] or []) for u,v in G.items()}
def table(gy,minn=12,verbose=True):
    W=collections.Counter();L=collections.Counter();E=collections.Counter();V=collections.Counter();N=collections.Counter()
    for r,pi in zip(rows,p):
        A,B=gy[r["a"]],gy[r["b"]]
        if A&B: continue
        for g in A:
            N[g]+=1;W[g]+=r["y"];E[g]+=pi;V[g]+=pi*(1-pi)
        for g in B:
            N[g]+=1;W[g]+=1-r["y"];E[g]+=1-pi;V[g]+=pi*(1-pi)
    out=[(g,N[g],W[g],N[g]-W[g],E[g],(W[g]-E[g])/math.sqrt(V[g]) if V[g] else 0) for g in N if N[g]>=minn]
    return sorted(out,key=lambda t:-t[1])
T=table(gy)
print(f"{'gym':32}{'bouts':>6}{'W-L':>8}{'win%':>6}{'exp W':>7}{'diff':>6}{'z':>6}")
for g,nn,w,l,e,z in T: print(f"{g:32}{nn:6}{w:4}-{l:<3}{100*w/nn:6.0f}{e:7.1f}{w-e:6.1f}{z:6.2f}")
stat=sum(z*z for *_,z in T); kk=len(T)
print("gyms",kk,"sum z^2",round(stat,1))
# permutation: shuffle gym membership across fighters
fighters=list(gy); lists=[gy[u] for u in fighters]
random.seed(1); cnt=0; R=2000; sims=[]
for _ in range(R):
    random.shuffle(lists); gp=dict(zip(fighters,lists))
    # keep same set of gyms>=12? recompute table with same threshold
    Tp=table(gp); sims.append(sum(z*z for *_,z in Tp)/max(len(Tp),1))
obs=stat/kk
print("mean z^2 observed",round(obs,2),"; permutation mean",round(np.mean(sims),2),"; p =",np.mean([s>=obs for s in sims]))
# single-gym fighters only
gy1={u:(s if len(s)==1 else set()) for u,s in gy.items()}
T1=table(gy1,10); print("single-gym only:",[(g,nn,f"{w}-{l}",round(w-e,1)) for g,nn,w,l,e,z in T1[:8]])
import csv
with open(f"gym_table_{LABEL}.csv","w",newline="") as fh:
    w=csv.writer(fh); w.writerow(["gym","bouts","wins","losses","win_pct","expected_wins","wins_above_expected","z"])
    for g,nn,ww,l,e,z in table(gy,6): w.writerow([g,nn,ww,l,round(100*ww/nn),round(e,1),round(ww-e,1),round(z,2)])
