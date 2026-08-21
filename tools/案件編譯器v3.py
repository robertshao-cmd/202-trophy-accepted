# -*- coding: utf-8 -*-
"""案件編譯器 v3:選犯人→選日→選發票→反推三幕題目"""
import csv, glob, json, random, statistics, collections, re, sys, os
from datetime import datetime
random.seed(20260821)

CATEGORY_MAP = {"超商":["7-ELEVEN","全家","萊爾富","OK超商"],
"超市量販":["全聯","家樂福","大潤發","好市多/Costco","喜互惠生鮮超市","美廉社"],
"連鎖餐飲":["麥當勞","摩斯漢堡","Sukiya","SUBWAY","梁社漢","丸亀製麵","漢堡王","Mister Donut","肯德基","八方雲集","三商巧福","爭鮮","藏壽司","築間","森森燒肉","燕妃重慶老火鍋","貳樓","清原芋圓","必勝客/PizzaHut","錢都日式涮涮鍋"],
"咖啡手搖":["星巴克","路易莎咖啡","cama","50嵐","清心福全","可不可熟成紅茶","麻古茶坊","迷客夏","大苑子","CoCo","康青龍","得正","萬波","龜記","無飲"],
"外送":["Uber Eats","foodpanda"]}
MC = {m:c for c,ms in CATEGORY_MAP.items() for m in ms}
SNACK = re.compile(r"(小吃|麵館|麵店|食堂|餐飲|飯|滷味|鹽酥|鹹酥|水餃|早餐|豆漿|便當|火鍋|燒臘|羊肉|牛肉麵|粥|米糕|雞排|販賣機)")
BL = re.compile(r"(衛生棉|護墊|濕式衛生|私密|保險套|驗孕|避孕|內衣|內褲|藥|醫|診所|處方|保健|益生菌|維他命|情趣|尿布)")
def cat(m, full=""):
    if m in MC: return MC[m]
    if SNACK.search(m) or SNACK.search(full): return "小吃"
    return None
def parse_dt(s):
    try: return datetime.strptime(s, "%Y-%m-%d %H:%M:%S")
    except: return None

people = {}
DATA_DIR = sys.argv[1] if len(sys.argv) > 1 else "./data"
OUT_DIR = sys.argv[2] if len(sys.argv) > 2 else "./out"
os.makedirs(OUT_DIR, exist_ok=True)
for f in sorted(glob.glob(os.path.join(DATA_DIR, "*.csv"))):
    people[f.split("發票-")[1].replace(".csv","")] = list(csv.DictReader(open(f, encoding="utf-8-sig")))

pools = {}
merchant_items = collections.defaultdict(set)
for n, rows in people.items():
    visits = collections.defaultdict(set); late = set()
    for r in rows:
        c = cat(r["商家"], r.get("商家全名",""))
        if c is None: continue
        visits[r["商家"]].add(r["發票號碼"])
        if not BL.search(r["品項"]): merchant_items[r["商家"]].add(r["品項"])
        dt = parse_dt(r["發票日期時間"])
        if dt and (dt.hour >= 22 or dt.hour < 5): late.add(r["發票號碼"])
    pools[n] = {"visit_counts": {m: len(s) for m,s in visits.items()}, "late_count": len(late)}
mall = collections.defaultdict(list)
for p in pools.values():
    for m,c in p["visit_counts"].items(): mall[m].append(c)
def dscore(n, m):
    return pools[n]["visit_counts"].get(m,0) / max(statistics.median(mall[m]) or 1, 1)
ALL_BRANDS = sorted({m for p in pools.values() for m in p["visit_counts"]})

# 每人×每商家詳細統計(第二幕口供素材)
brand_stats = collections.defaultdict(lambda: collections.defaultdict(
    lambda: {"invs": set(), "amt": {}, "items": set(), "hours": [], "dates": set()}))
for _n, _rows in people.items():
    for _r in _rows:
        if cat(_r["商家"], _r.get("商家全名","")) is None: continue
        _dt = parse_dt(_r["發票日期時間"])
        if not _dt: continue
        _s = brand_stats[_n][_r["商家"]]
        _s["invs"].add(_r["發票號碼"])
        try: _s["amt"][_r["發票號碼"]] = int(_r["發票金額"])
        except: pass
        if not BL.search(_r["品項"]): _s["items"].add(_r["品項"])
        _s["hours"].append(_dt.hour); _s["dates"].add(_dt.date().isoformat())

def period_of(hours):
    import statistics as _st
    h = _st.median(hours)
    return "早上" if h < 11 else "中午" if h < 14 else "下午" if h < 18 else "晚上" if h < 22 else "深夜"


def find_days(name):
    days = collections.defaultdict(dict)
    for r in people[name]:
        c = cat(r["商家"], r.get("商家全名",""))
        if c is None or BL.search(r["品項"]): continue
        dt = parse_dt(r["發票日期時間"])
        if not dt: continue
        d, inv = dt.date().isoformat(), r["發票號碼"]
        if inv not in days[d]:
            try: amt = int(r["發票金額"])
            except: amt = 0
            days[d][inv] = {"dt": dt, "time": dt.strftime("%H:%M"), "brand": r["商家"],
                            "reg_name": r.get("商家全名",""), "addr": r.get("店家地址",""), "amt": amt, "items": []}
        days[d][inv]["items"].append(r["品項"])
    out = []
    for d, invs in days.items():
        vs = sorted(invs.values(), key=lambda v: v["dt"])
        brands = [v["brand"] for v in vs]
        if not (3 <= len(vs) <= 5) or len(set(brands)) < 3: continue
        if (vs[-1]["dt"] - vs[0]["dt"]).seconds/3600 < 4: continue
        sig = max(dscore(name, b) for b in brands)
        if sig < 2: continue
        confus = min(sum(1 for o in pools if o != name and pools[o]["visit_counts"].get(b,0) >= 3) for b in set(brands))
        out.append({"date": d, "invoices": vs, "sig": round(sig,1), "confusable": confus, "nb": len(set(brands))})
    return sorted(out, key=lambda x: (-min(x["nb"],4), -x["confusable"], -x["sig"]))

JUNK = re.compile(r"(印花|貼紙|提袋|購物袋|塑膠袋|餐飲費|餐費|外送費|運費|服務費|折讓|折扣|會員|點數|應稅|免稅|小計)")

# 品項→分類(遮蔽用:不揭露原始品名)
ITEM_CATS = [
    (r"便當|丼|飯(?!糰)", "便當/飯類餐點"), (r"拿鐵|咖啡|美式|卡布|摩卡", "咖啡飲品"),
    (r"紅茶|綠茶|奶茶|青茶|烏龍茶|冬瓜|果茶|冰茶|檸檬茶", "手搖茶飲"),
    (r"鮮乳|鮮奶|牛乳|豆漿|豆奶", "乳品/豆漿"), (r"烏龍麵|拉麵|義大利麵|涼麵|麵(?!包)", "麵食"),
    (r"三明治|飯糰|御飯|沙拉|關東煮", "超商鮮食"), (r"麵包|吐司|蛋糕|甜甜圈|餅乾|蛋塔|甜點", "烘焙甜點"),
    (r"火鍋|鍋物|湯底", "鍋物"), (r"冰淇淋|聖代|霜淇淋|冰棒|芋圓", "冰品甜湯"),
    (r"衛生紙|洗衣|清潔|洗髮|抽取", "日用品"), (r"菇|青菜|水果|香蕉|蘋果|番茄|蔬", "蔬果生鮮"),
    (r"漢堡|薯條|炸雞|雞塊", "速食"), (r"壽司|生魚", "壽司"), (r"燒肉|烤肉", "燒肉"),
]
def item_cat(it):
    for pat, label in ITEM_CATS:
        if re.search(pat, it): return label
    return None
def stores_selling(cat_label, exclude, exclude_cat=None):
    """資料中也賣這類商品的店(混淆池):優先知名品牌(≥3人造訪過)"""
    pat = next(p for p, l in ITEM_CATS if l == cat_label)
    cands = [m for m, its in merchant_items.items()
             if m != exclude and any(re.search(pat, it) for it in its)]
    known = [m for m in cands if len(mall.get(m, [])) >= 3]
    return known if len(known) >= 3 else cands

def act1_questions(owner, invs):
    """三種題型全部「推地點」:品名分類推店家 / 登記名破解 / 通路小分類推店家"""
    qs, used_types = [], []
    for i, v in enumerate(invs):
        brand, reg, c = v["brand"], v["reg_name"], cat(v["brand"], v["reg_name"])
        items_show = [it for it in v["items"] if not BL.search(it) and not JUNK.search(it)]
        q = None
        # 型1:品名分類推店家(遮店名,品項只給分類)
        cats_ = [(it, item_cat(it)) for it in items_show if item_cat(it)]
        if cats_:
            it, label = cats_[0]
            decoys = stores_selling(label, brand)
            if len(decoys) >= 3:
                q = {"invoice_idx": i, "type": "品名分類推店家",
                     "prompt": "店名被污漬蓋住了,只辨識得出品項分類:「%s」,%s 消費 $%d。這是哪間店?" % (label, v["time"], v["amt"]),
                     "options": random.sample([brand]+random.sample(decoys, 3), 4),
                     "answer": brand, "遮蔽說明": "原始品項「%s」以分類呈現" % it[:14]}
        # 型2:登記名破解(遮品牌,給登記名+地址)
        if q is None and brand not in reg and len(reg) > 6:
            same_cat = [b for b in (CATEGORY_MAP.get(c, []) if c else ALL_BRANDS) if b != brand]
            decoys = same_cat if len(same_cat) >= 3 else [b for b in ALL_BRANDS if b != brand]
            q = {"invoice_idx": i, "type": "登記名破解",
                 "prompt": "污漬下只看得到登記名「%s」,地址在%s。這是哪間店?" % (reg[:16], v["addr"][:6]),
                 "options": random.sample([brand]+random.sample(decoys, 3), 4), "answer": brand}
        # 型3:通路小分類推店家(遮全部,給通路類別+時間金額)
        if q is None:
            sibs = [b for b in CATEGORY_MAP.get(c, []) if b != brand and b in ALL_BRANDS]
            decoys = sibs if len(sibs) >= 3 else [b for b in ALL_BRANDS if b != brand]
            q = {"invoice_idx": i, "type": "通路小分類推店家",
                 "prompt": "只辨識得出這是一張【%s】通路的發票,%s 消費 $%d,開在%s。是哪間店?" % (c or "零售", v["time"], v["amt"], v["addr"][:6]),
                 "options": random.sample([brand]+random.sample(decoys, 3), 4), "answer": brand}
        used_types.append(q["type"]); qs.append(q)
    return qs

def themed_truth(n, brand, case_date):
    """關於指定商家的真話,隨機挑一種"""
    s = brand_stats[n].get(brand)
    if not s or not s["invs"]:
        return "我三個月內從來沒去過「%s」" % brand
    opts = ["我三個月內去了「%s」%d 次" % (brand, len(s["invs"])),
            "我在「%s」總共花了大約 $%d" % (brand, round(sum(s["amt"].values()), -2))]
    if s["items"]:
        it = random.choice([i for i in s["items"] if 3 <= len(i) <= 18] or list(s["items"]))
        opts.append("我在「%s」買過「%s」" % (brand, it[:16]))
    if s["hours"]:
        opts.append("我通常%s才會去「%s」" % (period_of(s["hours"]), brand))
    if case_date not in s["dates"]:
        opts.append("案發那天我完全沒有在「%s」消費" % brand)
    return random.choice(opts)

def themed_lie(n, brand, case_date, is_culprit):
    """關於指定商家的假話"""
    s = brand_stats[n].get(brand)
    if is_culprit and s and case_date in s["dates"]:
        return "案發那天我完全沒有在「%s」消費" % brand, "說謊!案發當天他就在%s留下發票" % brand
    if s and s["invs"]:
        c = len(s["invs"]); fc = max(1, round(c * random.choice([0.3, 3])))
        if fc != c and random.random() < 0.6:
            return "我三個月內去了「%s」大約 %d 次" % (brand, fc), "實際 %d 次" % c
        others = [it for it in merchant_items[brand] if it not in s["items"] and 3 <= len(it) <= 18]
        if others:
            it = random.choice(others)
            return "我在「%s」買過「%s」" % (brand, it[:16]), "他從沒在%s買過這個" % brand
        return "我在「%s」總共花了大約 $%d" % (brand, round(sum(s["amt"].values()) * 3, -2)), "實際約 $%d" % round(sum(s["amt"].values()), -2)
    return "我常去「%s」,那裡我很熟" % brand, "他三個月內根本沒去過"

def act2_rounds(owner, invs, case_date, n_rounds=4):
    """主題輪:每輪綁定一個第一幕解碼出的商家"""
    case_brands = []
    for v in invs:
        if v["brand"] not in case_brands: case_brands.append(v["brand"])
    # 主題順序:辨識度低的商家先審,招牌店留最後一輪(配合漸進揭露)
    themes = sorted(case_brands, key=lambda b: dscore(owner, b))[-n_rounds:]
    sig_brand = max(case_brands, key=lambda b: dscore(owner, b))
    rounds, used = [], set()
    for ridx, brand in enumerate(themes):
        is_culprit_round = (brand == sig_brand)  # 犯人排在招牌店主題輪說謊
        heavy = sorted([n for n in pools if n != owner and n not in used
                        and len(brand_stats[n].get(brand, {}).get("invs", set())) >= 3],
                       key=lambda n: -len(brand_stats[n][brand]["invs"]))
        members = [owner] if is_culprit_round else []
        for n in heavy:
            if len(members) >= 3: break
            members.append(n); used.add(n)
        for n in pools:  # 補位
            if len(members) >= 3: break
            if n != owner and n not in used and n not in members:
                members.append(n); used.add(n)
        random.shuffle(members)
        liar = owner if is_culprit_round else random.choice(members)
        stmts = []
        for m_ in members:
            if m_ == liar:
                st, note = themed_lie(m_, brand, case_date, m_ == owner)
                stmts.append({"player": m_, "stmt": st, "is_lie": True, "note": note})
            else:
                stmts.append({"player": m_, "stmt": themed_truth(m_, brand, case_date),
                              "is_lie": False, "note": "路人,證詞屬實(可開證據卡驗證)"})
        rounds.append({"round": ridx+1, "theme": brand, "members": members, "liar": liar,
                       "statements": stmts,
                       "旁白": "第一幕的證據指向「%s」——傳喚三名與該店關係密切的嫌疑人" % brand})
    return rounds

def compile_case(owner):
    ds = find_days(owner)
    if not ds: return None
    day = ds[0]; invs = day["invoices"]
    for v in invs: v.pop("dt", None)
    brands = [v["brand"] for v in invs]
    sig_brand = max(set(brands), key=lambda b: dscore(owner, b))
    return {"owner": owner, "date": day["date"], "confusable": day["confusable"],
            "invoices": invs, "act1": act1_questions(owner, invs),
            "act2": act2_rounds(owner, invs, day["date"]),
            "act3": {"reveal": "行動線按真實時間戳播放",
                     "first_bet": "行動線播完開盤(押中400)",
                     "final_clue": "決定性線索:犯人是「%s」重度常客(三個月 %d 次)" % (sig_brand, pools[owner]["visit_counts"][sig_brand]),
                     "final_bet": "線索後末輪下注(押中150)",
                     "escape_bonus": "犯人每輪未被過半指認 +150"}}

def _case_key(n):
    ds = find_days(n)
    if not ds: return (-1, -1)
    return (min(ds[0]["nb"], 4), ds[0]["confusable"])
ranked = sorted(pools, key=lambda n: _case_key(n), reverse=True)
cases = [c for c in (compile_case(n) for n in ranked[:5]) if c]
json.dump({"cases": cases}, open(os.path.join(OUT_DIR, "案件包.json"),"w",encoding="utf-8"), ensure_ascii=False, indent=1)

c = cases[0]
L = ["# 案件腳本範例:%s 消費軌跡失竊案" % c["date"],
     "\n**真兇(僅系統可見):%s**|可混淆度:%d 名玩家同為相關商家常客\n" % (c["owner"], c["confusable"]),
     "\n## 第一幕:犯罪現場(拼湊消費行為)\n"]
for q in c["act1"]:
    L.append("**Q%d(%s)** %s" % (q["invoice_idx"]+1, q["type"], q["prompt"]))
    L.append("- 選項:%s" % " / ".join(q["options"]))
    L.append("- ✅ %s\n" % q["answer"])
L.append("\n## 第二幕:口供審訊(3人一組,揪出說謊者)\n")
for r in c["act2"]:
    L.append("### 第%d輪|主題:%s" % (r["round"], r["theme"]))
    L.append("_%s_" % r["旁白"])
    L.append("%s" % " vs ".join(r["members"]))
    for s in r["statements"]:
        L.append("- %s:「%s」%s(%s)" % (s["player"], s["stmt"], " 🤥" if s["is_lie"] else "", s["note"]))
    L.append("→ 本輪說謊者:**%s**,列入嫌疑名單\n" % r["liar"])
L.append("\n## 第三幕:終局指認\n")
for k, v in c["act3"].items(): L.append("- %s" % v)
L.append("\n完整行動線:%s" % " → ".join("%s %s($%d)" % (v["time"], v["brand"], v["amt"]) for v in c["invoices"]))
open(os.path.join(OUT_DIR, "案件腳本.md"),"w",encoding="utf-8").write("\n".join(L))

print("編譯 %d 組 | 範例:%s %s 可混淆度%d" % (len(cases), c["owner"], c["date"], c["confusable"]))
print("行動線:", " → ".join("%s %s" % (v["time"], v["brand"]) for v in c["invoices"]))
print("第一幕:", [q["type"] for q in c["act1"]])
print("第二幕說謊者:", [r["liar"] for r in c["act2"]])
