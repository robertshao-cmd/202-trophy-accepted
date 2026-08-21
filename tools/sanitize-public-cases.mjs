import { readFile, writeFile } from "node:fs/promises";

const target = new URL("../sites-app/lib/cases.json", import.meta.url);
const pack = JSON.parse(await readFile(target, "utf8"));

function timeBucket(value) {
  const hour = Number(String(value).split(":")[0]);
  if (hour < 6) return "深夜";
  if (hour < 9) return "清晨";
  if (hour < 12) return "上午";
  if (hour < 14) return "中午";
  if (hour < 18) return "下午";
  if (hour < 22) return "晚上";
  return "深夜";
}

function districtOnly(value) {
  const text = String(value ?? "");
  const match = text.match(/^(.+?[縣市])(.+?[區鄉鎮市])/);
  return match ? `${match[1]}${match[2]}` : "地點已模糊化";
}

function itemCategory(value) {
  const item = String(value ?? "");
  const categories = [
    [/咖啡|拿鐵|美式|茶|奶茶|飲料/, "飲品"],
    [/飯|麵|吐司|漢堡|壽司|水餃|便當|餐/, "餐點"],
    [/蛋糕|甜點|餅乾|可頌|麵包/, "烘焙甜點"],
    [/紙|清潔|洗|噴霧|袋/, "日用品"],
    [/水果|蔬|菇|鮮乳|牛奶/, "生鮮食品"],
    [/費|優惠|折扣/, "服務費用"],
  ];
  return categories.find(([pattern]) => pattern.test(item))?.[1] ?? "一般商品";
}

function maskedRegistration(value) {
  const text = String(value ?? "").replace(/\d/g, "█");
  return text.length > 12 ? `${text.slice(0, 12)}…` : text;
}

function roundedAmount(value) {
  return Math.max(10, Math.round(Number(value || 0) / 10) * 10);
}

for (const caseData of pack.cases ?? []) {
  caseData.date = String(caseData.date ?? "").slice(0, 7);
  caseData.invoices = (caseData.invoices ?? []).map((invoice) => ({
    ...invoice,
    time: timeBucket(invoice.time),
    reg_name: maskedRegistration(invoice.reg_name),
    addr: districtOnly(invoice.addr),
    amt: roundedAmount(invoice.amt),
    items: [...new Set((invoice.items ?? []).map(itemCategory))],
  }));

  caseData.act1 = (caseData.act1 ?? []).map((question) => {
    const invoice = caseData.invoices[question.invoice_idx];
    const base = { ...question, answer: question.answer };
    if (question.type === "品名分類推店家") {
      base.prompt = `店名被污漬蓋住，只看得出「${invoice.items[0]}」、${invoice.time}、約 $${invoice.amt}。這是哪間店？`;
      base["遮蔽說明"] = "原始品項已轉為分類呈現";
    } else if (question.type === "登記名破解") {
      base.prompt = `只看得到登記名「${invoice.reg_name}」，地點在${invoice.addr}。這是哪間店？`;
    } else {
      base.prompt = `只看得出這張發票來自連鎖通路，${invoice.time}消費約 $${invoice.amt}，地點在${invoice.addr}。這是哪間店？`;
    }
    return base;
  });
}

await writeFile(target, `${JSON.stringify(pack, null, 1)}\n`, "utf8");
