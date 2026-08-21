import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const defaultPublicDir = resolve(here, "public");

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp",
};

const DEFAULT_TIMINGS = {
  questionMs: 10_000,
  revealMs: 7_000,
  leaderboardMs: 3_000,
  botAnswerMs: 2_500,
};

export const DETECTIVE_SUSPECTS = [
  { id: "rebecca", name: "Rebecca｜彭聿采", alias: "小吃帳本王", avatar: "B", avatarUrl: "/avatars/rebecca.png", avatarSource: "Jira", color: "#6dd7c7" },
  { id: "xu-ruiyu", name: "Rita｜徐瑞妤", alias: "超商地圖王", avatar: "R", avatarUrl: "/avatars/xu-ruiyu.png", avatarSource: "Jira", color: "#f5c451" },
  { id: "he-pinru", name: "Clark｜何品儒", alias: "速食巡查員", avatar: "C", avatarUrl: "/avatars/he-pinru.png", avatarSource: "Jira", color: "#ff6e56" },
  { id: "huang-junlin", name: "Neil｜黃俊霖", alias: "7-ELEVEN 地縛靈", avatar: "N", avatarUrl: "/avatars/huang-junlin.png", avatarSource: "Jira", color: "#a98cff" },
];

const LEGACY_DETECTIVE_QUESTIONS = [
  {
    id: "q1",
    type: "lie",
    act: "ACT I｜口供對決",
    label: "兩真一假",
    subject: "Robert",
    prompt: "Robert 的三份消費口供，哪一份和發票對不上？",
    choices: [
      { id: "a", label: "三個月內造訪全家 13 次" },
      { id: "b", label: "三個月內造訪 7-ELEVEN 約 2 次" },
      { id: "c", label: "三個月內造訪家樂福 6 次" },
    ],
    correctChoice: "b",
    evidence: {
      eyebrow: "TESTIMONY 01",
      rows: [
        ["嫌疑人", "Robert｜邵士銓"],
        ["7-ELEVEN", "6 次"],
        ["全家", "13 次"],
        ["家樂福", "6 次"],
      ],
      finding: "抓到了。7-ELEVEN 實際是 6 次，不是 2 次。說謊不等於犯案，但 Robert 暫時不能排除。",
    },
  },
  {
    id: "q2",
    type: "lie",
    act: "ACT I｜口供對決",
    label: "兩真一假",
    subject: "Michelle",
    prompt: "Michelle 說了三句話，哪一句被發票當場打臉？",
    choices: [
      { id: "a", label: "三個月內造訪全家約 5 次" },
      { id: "b", label: "三個月內造訪 7-ELEVEN 26 次" },
      { id: "c", label: "三個月內造訪全聯 13 次" },
    ],
    correctChoice: "a",
    evidence: {
      eyebrow: "TESTIMONY 02",
      rows: [
        ["嫌疑人", "Michelle｜邱庭"],
        ["全家", "18 次"],
        ["7-ELEVEN", "26 次"],
        ["全聯", "13 次"],
      ],
      finding: "全家實際留下 18 次造訪紀錄。Michelle 的『約 5 次』供詞破功。",
    },
  },
  {
    id: "q3",
    type: "lie",
    act: "ACT I｜口供對決",
    label: "兩真一假",
    subject: "Rebecca",
    prompt: "Rebecca 的口供裡藏了一個假數字，找出來。",
    choices: [
      { id: "a", label: "三個月內造訪五竹餐飲 13 次" },
      { id: "b", label: "三個月內造訪全聯約 18 次" },
      { id: "c", label: "三個月內造訪 SUBWAY 10 次" },
    ],
    correctChoice: "b",
    evidence: {
      eyebrow: "TESTIMONY 03",
      rows: [
        ["嫌疑人", "Rebecca｜彭聿采"],
        ["五竹餐飲", "13 次"],
        ["全聯", "6 次"],
        ["SUBWAY", "10 次"],
      ],
      finding: "全聯實際只有 6 次。第三位說謊者出現；三人都有嫌疑，但還沒有人被定罪。",
    },
  },
  {
    id: "q4",
    type: "amount",
    act: "ACT II｜消費側寫",
    label: "金額競猜",
    subject: "Robert",
    prompt: "Robert 三個月在【超市量販】總共花了多少？",
    choices: [
      { id: "2400", label: "約 NT$ 2,400" },
      { id: "4100", label: "約 NT$ 4,100" },
      { id: "5900", label: "約 NT$ 5,900" },
      { id: "9500", label: "約 NT$ 9,500" },
    ],
    correctChoice: "5900",
    evidence: {
      eyebrow: "PROFILE 01",
      rows: [
        ["嫌疑人", "Robert｜邵士銓"],
        ["分類", "超市量販"],
        ["實際總額", "NT$ 5,924"],
        ["最高單筆", "家樂福 NT$ 1,635"],
      ],
      finding: "最接近的是 NT$ 5,900；實際合計 NT$ 5,924。側寫只縮小範圍，不能單獨定罪。",
    },
  },
  {
    id: "q5",
    type: "amount",
    act: "ACT II｜消費側寫",
    label: "金額競猜",
    subject: "Michelle",
    prompt: "Michelle 三個月在【超市量販】總共花了多少？",
    choices: [
      { id: "3300", label: "約 NT$ 3,300" },
      { id: "5700", label: "約 NT$ 5,700" },
      { id: "8200", label: "約 NT$ 8,200" },
      { id: "13100", label: "約 NT$ 13,100" },
    ],
    correctChoice: "8200",
    evidence: {
      eyebrow: "PROFILE 02",
      rows: [
        ["嫌疑人", "Michelle｜邱庭"],
        ["分類", "超市量販"],
        ["實際總額", "NT$ 8,212"],
        ["全聯造訪", "13 次"],
      ],
      finding: "最接近的是 NT$ 8,200；實際合計 NT$ 8,212。她的超市路線比口供更完整。",
    },
  },
  {
    id: "q6",
    type: "amount",
    act: "ACT II｜消費側寫",
    label: "金額競猜",
    subject: "Rebecca",
    prompt: "Rebecca 三個月在【小吃】總共花了多少？",
    choices: [
      { id: "3800", label: "約 NT$ 3,800" },
      { id: "6700", label: "約 NT$ 6,700" },
      { id: "9600", label: "約 NT$ 9,600" },
      { id: "15400", label: "約 NT$ 15,400" },
    ],
    correctChoice: "9600",
    evidence: {
      eyebrow: "PROFILE 03",
      rows: [
        ["嫌疑人", "Rebecca｜彭聿采"],
        ["分類", "小吃"],
        ["實際總額", "NT$ 9,624"],
        ["五竹餐飲", "13 次"],
      ],
      finding: "最接近的是 NT$ 9,600；實際合計 NT$ 9,624。她的高頻餐飲軌跡開始與現場線索交會。",
    },
  },
  {
    id: "q7",
    type: "tool",
    act: "ACT III｜現場碎片",
    label: "物證辨認",
    prompt: "展示櫃旁有一股強烈除菌香氣。哪個真實品項最可能對上？",
    choices: [
      { id: "febreze", label: "風倍清噴霧除菌" },
      { id: "yogurt", label: "福樂頂級無加糖優格" },
      { id: "table", label: "開桌服務" },
      { id: "milk", label: "瑞穗極製鮮乳" },
    ],
    correctChoice: "febreze",
    evidence: {
      eyebrow: "FORENSICS",
      rows: [
        ["現場殘留", "除菌噴霧氣味"],
        ["吻合品項", "風倍清噴霧除菌"],
        ["同筆品項", "ARIEL 室內瓶"],
        ["證據狀態", "待追來源"],
      ],
      finding: "物證吻合，但買過不等於犯案。下一步必須找出這筆消費的日期與通路。",
    },
  },
  {
    id: "q8",
    type: "source",
    act: "ACT IV｜來源追查",
    label: "發票解碼",
    prompt: "風倍清與 ARIEL 出現在 2026/06/15 的同一筆發票。來源商家是哪裡？",
    choices: [
      { id: "rtmart", label: "大潤發" },
      { id: "carrefour", label: "家樂福" },
      { id: "pxmart", label: "全聯" },
      { id: "family", label: "全家" },
    ],
    correctChoice: "rtmart",
    evidence: {
      eyebrow: "SOURCE TRACE",
      rows: [
        ["日期", "2026/06/15"],
        ["商家", "大潤發"],
        ["發票總額", "NT$ 1,687"],
        ["敏感欄位", "已遮蔽"],
      ],
      finding: "來源鎖定大潤發。完整發票號碼、地址與付款方式均不顯示。只剩最後一問：這筆發票是誰的？",
    },
  },
  {
    id: "q9",
    type: "identity",
    act: "ACT V｜最終指認",
    label: "誰是犯人",
    prompt: "把口供、品項、日期與商家串起來：這宗虛構案件中，誰是犯人？",
    choices: [
      { id: "robert", label: "Robert｜邵士銓" },
      { id: "michelle", label: "Michelle｜邱庭" },
      { id: "rebecca", label: "Rebecca｜彭聿采" },
      { id: "ghost", label: "發票幽靈" },
    ],
    correctChoice: "rebecca",
    evidence: {
      eyebrow: "EVIDENCE CHAIN CLOSED",
      rows: [
        ["遊戲犯人", "Rebecca｜彭聿采"],
        ["購買日期", "2026/06/15"],
        ["來源", "大潤發"],
        ["關鍵品項", "風倍清噴霧除菌"],
      ],
      finding: "證據鏈閉合：真實消費只證明購買紀錄；獎盃失竊、口供與犯人身分皆為遊戲虛構。",
    },
  },
];

export const DETECTIVE_QUESTIONS = [
  {
    id: "q1",
    type: "merchant",
    act: "第一幕｜蒐集資訊",
    label: "破解商家",
    prompt: "模糊發票只剩「全聯實業…中和分公司」與總額 NT$ 1,687。這間店是哪個通路？",
    choices: [
      { id: "rtmart", label: "大潤發" },
      { id: "pxmart", label: "全聯" },
      { id: "carrefour", label: "家樂福" },
      { id: "costco", label: "好市多" },
    ],
    correctChoice: "rtmart",
    evidence: {
      eyebrow: "CLUE DECODE 01",
      rows: [
        ["模糊抬頭", "全聯實業…中和分公司"],
        ["通路解碼", "大潤發"],
        ["發票總額", "NT$ 1,687"],
        ["敏感欄位", "已遮蔽"],
      ],
      finding: "第一塊拼圖成立：商家是大潤發。法律登記名稱不等於大家熟悉的通路名稱。",
    },
  },
  {
    id: "q2",
    type: "item",
    act: "第一幕｜蒐集資訊",
    label: "猜測品名",
    prompt: "同筆發票還留下「除菌、噴霧、NT$ 99」三個碎片。真正品名是什麼？",
    choices: [
      { id: "febreze", label: "風倍清噴霧除菌" },
      { id: "yogurt", label: "福樂頂級無加糖優格" },
      { id: "table", label: "開桌服務" },
      { id: "milk", label: "瑞穗極製鮮乳" },
    ],
    correctChoice: "febreze",
    evidence: {
      eyebrow: "CLUE DECODE 02",
      rows: [
        ["品項", "風倍清噴霧除菌"],
        ["單價", "NT$ 99"],
        ["同筆品項", "ARIEL 室內瓶"],
        ["線索狀態", "等待確認發票"],
      ],
      finding: "第二塊拼圖成立：物品是風倍清噴霧除菌。先別猜犯人，必須把完整發票拼回來。",
    },
  },
  {
    id: "q3",
    type: "invoice",
    act: "第一幕｜蒐集資訊",
    label: "確認發票",
    prompt: "哪一組日期、商家與品項，能把這張模糊發票完整復原？",
    choices: [
      { id: "a", label: "6/15 → 大潤發 → 風倍清噴霧除菌" },
      { id: "b", label: "7/23 → 家樂福 → 無加糖優格" },
      { id: "c", label: "8/18 → 路易莎 → 開桌服務" },
      { id: "d", label: "5/24 → 大潤發 → 瑞穗鮮乳" },
    ],
    correctChoice: "a",
    evidence: {
      eyebrow: "INVOICE CONFIRMED",
      rows: [
        ["日期", "2026/06/15"],
        ["商家", "大潤發"],
        ["發票總額", "NT$ 1,687"],
        ["關鍵品項", "風倍清噴霧除菌"],
      ],
      finding: "資訊蒐集完成。日期、商家、金額與品項已確認；下一幕才開始審口供。",
    },
  },
  {
    id: "q4",
    type: "lie",
    act: "第二幕｜框出嫌疑人",
    label: "口供第 1 組",
    prompt: "三人各說一項消費習慣，只有一人在說謊。把他框進嫌疑區。",
    choices: [
      { id: "robert", personId: "robert", name: "Robert｜邵士銓", avatarUrl: "/avatars/robert.png", label: "我三個月內造訪全家 13 次。" },
      { id: "michelle", personId: "michelle", name: "Michelle｜邱庭", avatarUrl: "/avatars/michelle.png", label: "我三個月內造訪 7-ELEVEN 26 次。" },
      { id: "rebecca", personId: "rebecca", name: "Rebecca｜彭聿采", avatarUrl: "/avatars/rebecca.png", label: "我三個月內造訪全聯 18 次。" },
    ],
    correctChoice: "rebecca",
    evidence: {
      eyebrow: "INTERROGATION 01",
      rows: [
        ["說謊者", "Rebecca｜彭聿采"],
        ["她的口供", "全聯 18 次"],
        ["發票真相", "全聯只有 6 次"],
        ["處置", "嫌疑人 1/4"],
      ],
      finding: "Rebecca 的全聯紀錄實際只有 6 次。聚光燈鎖定，但說謊只代表進入嫌疑區，不等於定罪。",
    },
  },
  {
    id: "q5",
    type: "lie",
    act: "第二幕｜框出嫌疑人",
    label: "口供第 2 組",
    prompt: "第二組接受訊問：哪一位的數字經不起發票核對？",
    choices: [
      { id: "xu-ruiyu", personId: "xu-ruiyu", name: "Rita｜徐瑞妤", avatarUrl: "/avatars/xu-ruiyu.png", label: "我三個月內只去全家 30 次。" },
      { id: "he-pinru", personId: "he-pinru", name: "Clark｜何品儒", avatarUrl: "/avatars/he-pinru.png", label: "我三個月內造訪麥當勞 13 次。" },
      { id: "huang-junlin", personId: "huang-junlin", name: "Neil｜黃俊霖", avatarUrl: "/avatars/huang-junlin.png", label: "我三個月內造訪 7-ELEVEN 99 次。" },
    ],
    correctChoice: "xu-ruiyu",
    evidence: {
      eyebrow: "INTERROGATION 02",
      rows: [
        ["說謊者", "Rita｜徐瑞妤"],
        ["她的口供", "全家 30 次"],
        ["發票真相", "全家高達 76 次"],
        ["處置", "嫌疑人 2/4"],
      ],
      finding: "Rita 不是少去一點，是把 76 次說成 30 次。第二張嫌疑人檔案正式入列。",
    },
  },
  {
    id: "q6",
    type: "lie",
    act: "第二幕｜框出嫌疑人",
    label: "口供第 3 組",
    prompt: "第三組換位再問一次。誰把自己的消費頻率說小了？",
    choices: [
      { id: "michelle", personId: "michelle", name: "Michelle｜邱庭", avatarUrl: "/avatars/michelle.png", label: "我三個月內造訪 7-ELEVEN 26 次。" },
      { id: "he-pinru", personId: "he-pinru", name: "Clark｜何品儒", avatarUrl: "/avatars/he-pinru.png", label: "我三個月內只吃麥當勞 3 次。" },
      { id: "robert", personId: "robert", name: "Robert｜邵士銓", avatarUrl: "/avatars/robert.png", label: "我三個月內造訪全家 13 次。" },
    ],
    correctChoice: "he-pinru",
    evidence: {
      eyebrow: "INTERROGATION 03",
      rows: [
        ["說謊者", "Clark｜何品儒"],
        ["他的口供", "麥當勞 3 次"],
        ["發票真相", "麥當勞 13 次"],
        ["處置", "嫌疑人 3/4"],
      ],
      finding: "Clark 少報了整整 10 次麥當勞。第三位嫌疑人被紅框送進最終名單。",
    },
  },
  {
    id: "q7",
    type: "lie",
    act: "第二幕｜框出嫌疑人",
    label: "口供第 4 組",
    prompt: "最後一組口供。誰的便利商店數字離真相最遠？",
    choices: [
      { id: "rebecca", personId: "rebecca", name: "Rebecca｜彭聿采", avatarUrl: "/avatars/rebecca.png", label: "我三個月內造訪五竹餐飲 13 次。" },
      { id: "xu-ruiyu", personId: "xu-ruiyu", name: "Rita｜徐瑞妤", avatarUrl: "/avatars/xu-ruiyu�G����ƭy� label: "證據鏈結案",
    prompt: "哪一條消費行動線，能讓證據鏈完整閉合？",
    choices: [
      { id: "a", label: "6/15 購買 → 大潤發 → 風倍清 → Rebecca 發票" },
      { id: "b", label: "7/23 購買 → 家樂福 → 優格 → Michelle 發票" },
      { id: "c", label: "8/18 購買 → 路易莎 → 開桌 → Robert 發票" },
      { id: "d", label: "先猜犯人 → 再挑一張看起來合理的發票" },
    ],
    correctChoice: "a",
    evidence: {
      eyebrow: "EVIDENCE CHAIN CLOSED",
      rows: [
        ["遊戲犯人", "Rebecca｜彭聿采"],
        ["購買日期", "2026/06/15"],
        ["來源", "大潤發"],
        ["關鍵品項", "風倍清噴霧除菌"],
      ],
      finding: "證據鏈閉合：真實消費只證明購買紀錄；獎盃失竊、口供與犯人身分皆為遊戲虛構。",
    },
  },
];

function sendJson(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(body));
}

async function readJson(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 100_000) throw Object.assign(new Error("payload_too_large"), { statusCode: 413 });
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw Object.assign(new Error("invalid_json"), { statusCode: 400 });
  }
}

function cleanNickname(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, 16);
}

function createRoomCode(rooms) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const code = String(Math.floor(1000 + Math.random() * 9000));
    if (!rooms.has(code)) return code;
  }
  return String(Date.now()).slice(-4);
}

function createRoom(rooms, now) {
  const code = createRoomCode(rooms);
  const room = {
    code,
    hostKey: randomUUID(),
    createdAt: now(),
    phase: "lobby",
    questionIndex: -1,
    phaseStartedAt: null,
    phaseEndsAt: null,
    players: [],
    answers: {},
    settledQuestions: [],
  };
  rooms.set(code, room);
  return room;
}

function requireHost(room, hostKey) {
  if (!hostKey || hostKey !== room.hostKey) throw Object.assign(new Error("host_required"), { statusCode: 403 });
}

function beginQuestion(room, index, now, timings) {
  room.questionIndex = index;
  room.phase = "question";
  room.phaseStartedAt = now();
  room.phaseEndsAt = room.phaseStartedAt + timings.questionMs;
  room.answers[index] = {};
}

function settleQuestion(room, now, timings) {
  if (room.settledQuestions.includes(room.questionIndex)) return;
  const question = DETECTIVE_QUESTIONS[room.questionIndex];
  const answers = room.answers[room.questionIndex] ?? {};
  for (const player of room.players) {
    const answer = answers[player.id];
    if (answer?.choice === question.correctChoice) player.score += answer.points;
  }
  room.settledQuestions.push(room.questionIndex);
  room.phase = "reveal";
  room.phaseStartedAt = now();
  room.phaseEndsAt = room.phaseStartedAt + timings.revealMs;
}

function syncRoom(room, now, timings) {
  const timestamp = now();
  if (room.phase === "question") {
    const question = DETECTIVE_QUESTIONS[room.questionIndex];
    const answers = room.answers[room.questionIndex] ?? {};
    if (timestamp - room.phaseStartedAt >= timings.botAnswerMs) {
      room.players.filter((player) => player.isBot && !answers[player.id]).forEach((player, index) => {
        const choices = question.choices.map((choice) => choice.id);
        const choice = (room.questionIndex + index) % 4 === 0
          ? choices[(choices.indexOf(question.correctChoice) + 1) % choices.length]
          : question.correctChoice;
        answers[player.id] = { choice, answeredAt: timestamp, points: choice === question.correctChoice ? 125 : 0 };
      });
    }
    if (timestamp >= room.phaseEndsAt || (room.players.length > 0 && Object.keys(answers).length >= room.players.length)) {
      settleQuestion(room, now, timings);
    }
  } else if (room.phase === "reveal" && timestamp >= room.phaseEndsAt) {
    room.phase = "leaderboard";
    room.phaseStartedAt = timestamp;
    room.phaseEndsAt = timestamp + timings.leaderboardMs;
  } else if (room.phase === "leaderboard" && timestamp >= room.phaseEndsAt) {
    if (room.questionIndex + 1 >= DETECTIVE_QUESTIONS.length) {
      room.phase = "results";
      room.phaseStartedAt = timestamp;
      room.phaseEndsAt = null;
    } else {
      beginQuestion(room, room.questionIndex + 1, now, timings);
    }
  }
}

function answerDistribution(room, question) {
  const distribution = Object.fromEntries(question.choices.map((choice) => [choice.id, 0]));
  for (const answer of Object.values(room.answers[room.questionIndex] ?? {})) {
    if (answer.choice in distribution) distribution[answer.choice] += 1;
  }
  return distribution;
}

function leaderboard(room) {
  return room.players
    .map(({ id, nickname, score, isBot }) => ({ id, nickname, score, isBot }))
    .sort((a, b) => b.score - a.score || a.nickname.localeCompare(b.nickname, "zh-Hant"));
}

function publicRoom(room, viewer = {}) {
  const current = room.questionIndex >= 0 ? DETECTIVE_QUESTIONS[room.questionIndex] : null;
  const reveal = room.phase === "reveal" || room.phase === "leaderboard" || room.phase === "results";
  const answers = room.answers[room.questionIndex] ?? {};
  const totalAnswers = room.settledQuestions.reduce((sum, index) => sum + Object.keys(room.answers[index] ?? {}).length, 0);
  const correctAnswers = room.settledQuestions.reduce((sum, index) => {
    const answerSet = room.answers[index] ?? {};
    return sum + Object.values(answerSet).filter((answer) => answer.choice === DETECTIVE_QUESTIONS[index].correctChoice).length;
  }, 0);
  const ranks = leaderboard(room);
  return {
    code: room.code,
    phase: room.phase,
    questionIndex: room.questionIndex,
    questionCount: DETECTIVE_QUESTIONS.length,
    phaseStartedAt: room.phaseStartedAt,
    phaseEndsAt: room.phaseEndsAt,
    suspects: DETECTIVE_SUSPECTS,
    players: room.players.map(({ id, nickname, score, isBot }) => ({ id, nickname, score, isBot })),
    leaderboard: ranks,
    answeredCount: Object.keys(answers).length,
    viewerAnswered: Boolean(viewer.playerKey && answers[viewer.playerKey]),
    viewerChoice: viewer.playerKey ? answers[viewer.playerKey]?.choice ?? null : null,
    isHost: Boolean(viewer.hostKey && viewer.hostKey === room.hostKey),
    question: current ? {
      id: current.id,
      type: current.type,
      act: current.act,
      label: current.label,
      subject: current.subject ?? null,
      subjectId: current.subjectId ?? null,
      prompt: current.prompt,
      choices: current.choices,
      ...(reveal ? {
        correctChoice: current.correctChoice,
        evidence: current.evidence,
        distribution: answerDistribution(room, current),
      } : {}),
    } : null,
    results: room.phase === "results" ? {
      champion: ranks[0] ?? null,
      accuracy: totalAnswers ? Math.round((correctAnswers / totalAnswers) * 100) : 0,
      totalAnswers,
      culprit: "Rebecca｜彭聿采",
      culpritId: "rebecca",
      culpritPortrait: "/avatars/rebecca.png",
      finalSuspects: DETECTIVE_SUSPECTS,
      evidenceChain: ["6/15 購買", "大潤發", "風倍清噴霧除菌", "Rebecca 的發票"],
      caseFinding: "發票證明了購買紀錄；202 獎盃失竊、口供與犯人身分皆為遊戲虛構。",
      needPyramid: [
        { level: "自我實現", value: "看懂自己的消費模式，選一件想改變的小事" },
        { level: "尊重", value: "用推理勳章肯定觀察力，不用消費羞辱任何人" },
        { level: "愛與歸屬", value: "三人互證、全場投票、十秒本人補充，創造共同笑點" },
        { level: "安全", value: "本人同意、敏感欄位遮蔽，案情與定罪皆標示為遊戲虛構" },
        { level: "生理", value: "從吃飯、喝水、便利商店等日常生存消費切入" },
      ],
    } : null,
  };
}

function resetRoom(room) {
  room.phase = "lobby";
  room.questionIndex = -1;
  room.phaseStartedAt = null;
  room.phaseEndsAt = null;
  room.answers = {};
  room.settledQuestions = [];
  room.players.forEach((player) => { player.score = 0; });
}

export function createAppServer({ publicDir = defaultPublicDir, now = Date.now, timings = DEFAULT_TIMINGS } = {}) {
  const rooms = new Map();
  return createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://localhost");
      if (url.pathname === "/api/health" && req.method === "GET") {
        return sendJson(res, 200, { ok: true, service: "invoice-idea-lab", storage: "browser-local-only" });
      }

      if (url.pathname === "/api/detective/rooms" && req.method === "POST") {
        const room = createRoom(rooms, now);
        return sendJson(res, 201, { room: publicRoom(room, { hostKey: room.hostKey }), hostKey: room.hostKey });
      }

      const roomRoute = url.pathname.match(/^\/api\/detective\/rooms\/([0-9]{4})(?:\/(join|fill|start|answer|reset|advance))?$/);
      if (roomRoute) {
        const [, code, action] = roomRoute;
        const room = rooms.get(code);
        if (!room) return sendJson(res, 404, { error: "case_not_found" });
        syncRoom(room, now, timings);
        if (!action && req.method === "GET") {
          return sendJson(res, 200, publicRoom(room, {
            playerKey: url.searchParams.get("player"),
            hostKey: url.searchParams.get("host"),
          }));
        }
        if (req.method !== "POST") return sendJson(res, 405, { error: "method_not_allowed" });
        const body = await readJson(req);

        if (action === "join") {
          if (room.phase !== "lobby") return sendJson(res, 409, { error: "case_already_started" });
          if (room.players.length >= 8) return sendJson(res, 409, { error: "case_full" });
          const nickname = cleanNickname(body.nickname);
          if (nickname.length < 2) return sendJson(res, 400, { error: "nickname_too_short" });
          if (room.players.some((player) => player.nickname.toLocaleLowerCase() === nickname.toLocaleLowerCase())) {
            return sendJson(res, 409, { error: "nickname_taken" });
          }
          const player = { id: randomUUID(), nickname, score: 0, isBot: false };
          room.players.push(player);
          return sendJson(res, 201, { playerKey: player.id, room: publicRoom(room, { playerKey: player.id }) });
        }

        if (action === "answer") {
          if (room.phase !== "question") return sendJson(res, 409, { error: "answering_closed" });
          const player = room.players.find((candidate) => candidate.id === body.playerKey && !candidate.isBot);
          if (!player) return sendJson(res, 403, { error: "player_required" });
          const question = DETECTIVE_QUESTIONS[room.questionIndex];
          if (!question.choices.some((choice) => choice.id === body.choice)) return sendJson(res, 400, { error: "invalid_choice" });
          const answers = room.answers[room.questionIndex] ?? {};
          if (answers[player.id]) return sendJson(res, 409, { error: "answer_locked" });
          const secondsLeft = Math.max(0, Math.ceil((room.phaseEndsAt - now()) / 1000));
          answers[player.id] = {
            choice: body.choice,
            answeredAt: now(),
            points: body.choice === question.correctChoice ? 100 + secondsLeft * 5 : 0,
          };
          room.answers[room.questionIndex] = answers;
          syncRoom(room, now, timings);
          return sendJson(res, 200, publicRoom(room, { playerKey: player.id }));
        }

        requireHost(room, body.hostKey);
        if (action === "fill") {
          if (room.phase !== "lobby") return sendJson(res, 409, { error: "case_already_started" });
          const demoNames = ["餅乾警探", "手搖線民", "宵夜目擊者", "發票小精靈", "冰箱鑑識官", "週末美食家"];
          while (room.players.length < 6) {
            const nickname = demoNames.find((name) => !room.players.some((player) => player.nickname === name)) ?? `示範偵探 ${room.players.length + 1}`;
            room.players.push({ id: randomUUID(), nickname, score: 0, isBot: true });
          }
          return sendJson(res, 200, publicRoom(room, { hostKey: body.hostKey }));
        }
        if (action === "start") {
          if (room.phase !== "lobby") return sendJson(res, 409, { error: "case_already_started" });
          if (room.players.length < 4) return sendJson(res, 409, { error: "need_four_detectives" });
          beginQuestion(room, 0, now, timings);
          return sendJson(res, 200, publicRoom(room, { hostKey: body.hostKey }));
        }
        if (action === "reset") {
          resetRoom(room);
          return sendJson(res, 200, publicRoom(room, { hostKey: body.hostKey }));
        }
        if (action === "advance") {
          if (room.phase === "question") settleQuestion(room, now, timings);
          else if (room.phase === "reveal") {
            room.phase = "leaderboard";
            room.phaseStartedAt = now();
            room.phaseEndsAt = now() + timings.leaderboardMs;
          } else if (room.phase === "leaderboard") {
            if (room.questionIndex + 1 >= DETECTIVE_QUESTIONS.length) room.phase = "results";
            else beginQuestion(room, room.questionIndex + 1, now, timings);
          }
          return sendJson(res, 200, publicRoom(room, { hostKey: body.hostKey }));
        }
        return sendJson(res, 404, { error: "unknown_action" });
      }

      if (req.method !== "GET" && req.method !== "HEAD") return sendJson(res, 405, { error: "method_not_allowed" });

      const requested = url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname.slice(1));
      const root = resolve(publicDir);
      const filePath = resolve(root, requested);
      if (!filePath.startsWith(`${root}\\`) && filePath !== resolve(root, "index.html")) return sendJson(res, 403, { error: "forbidden" });

      const data = await readFile(filePath);
      res.writeHead(200, {
        "Content-Type": mimeTypes[extname(filePath)] ?? "application/octet-stream",
        "Cache-Control": extname(filePath) === ".html" ? "no-store" : "public, max-age=60",
      });
      if (req.method === "HEAD") return res.end();
      res.end(data);
    } catch (error) {
      if (error?.code === "ENOENT") return sendJson(res, 404, { error: "not_found" });
      sendJson(res, error?.statusCode ?? 500, { error: error?.message ?? "internal_error" });
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const port = Number(process.env.PORT || 4173);
  const server = createAppServer();
  server.listen(port, "0.0.0.0", () => console.log(`Invoice Idea Lab: http://localhost:${port}`));
}
