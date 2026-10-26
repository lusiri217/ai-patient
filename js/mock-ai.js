/* ============================================================
   mock-ai.js — 演示模式 / 模拟患者 / 结构化病例生成
   当无 API Key、被停止调用、或开启演示模式时，由本模块提供回退：
     1) 模拟患者对话（含关键线索词 [[word]] 标记）
     2) 由原始文本生成结构化病例（含去隐私化）
     3) 自动生成 4 道选择题 + 1 道简答题
   真实接入大模型时，这些能力由 js/api.js 调用后端/大模型实现。
   ============================================================ */

window.AIPS = window.AIPS || {};

AIPS.mock = (function () {
  const util = AIPS.util;

  function randInt(a, b) {
    return Math.floor(Math.random() * (b - a + 1)) + a;
  }
  function pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  /* ---------------- 去隐私化 ---------------- */
  function dePrivacy(text) {
    if (!text) return "";
    let t = String(text);
    // 身份证号（18 位，末位可为 X）
    t = t.replace(/\b\d{17}[\dXx]\b/g, "【身份证号】");
    // 手机号
    t = t.replace(/\b1[3-9]\d{9}\b/g, "【电话】");
    // 姓名：姓名：张三 / 患者：张三 / 病人：张三
    t = t.replace(/(姓名|患者|病人|就诊人|家属)[:：]\s*[\u4e00-\u9fa5]{2,4}/g, (m) => m.replace(/[\u4e00-\u9fa5]{2,4}$/, "【姓名】"));
    // 住院号 / 门诊号
    t = t.replace(/(住院号|门诊号|病案号|就诊卡号)[:：]?\s*[\w-]{4,}/g, (m) => m.replace(/[\w-]{4,}$/, "【编号】"));
    // 地址
    t = t.replace(/(住址|地址|户籍|现住)[:：]\s*[^，。\n]{4,}/g, (m) => m.replace(/[^，。\n]{4,}$/, "【地址】"));
    // 银行卡
    t = t.replace(/\b\d{16,19}\b/g, "【银行卡号】");
    return t;
  }

  /* ---------------- 将原始文本转为结构化病例 ---------------- */
  function buildStructuredCase(rawText, meta = {}) {
    rawText = dePrivacy(rawText || "");
    const lines = rawText
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);

    // 尝试按标签切分
    const grab = (labels) => {
      const re = new RegExp("(" + labels.join("|") + ")\\s*[:：]?\\s*(.*)");
      for (let i = 0; i < lines.length; i++) {
        const m = lines[i].match(re);
        if (m) {
          let val = m[2] || "";
          // 合并后续非标签行
          let j = i + 1;
          while (j < lines.length && !lines[j].match(/^(主诉|现病史|既往史|体格检查|查体|辅助检查|化验|影像|诊断|鉴别诊断|初步诊断)[:：]/)) {
            val += "\n" + lines[j];
            j++;
          }
          return val.trim();
        }
      }
      return "";
    };

    const title =
      meta.title ||
      (lines[0] && lines[0].length <= 40 ? lines[0] : "未命名病例") ||
      "未命名病例";
    const type = meta.type || "其他";

    let chief = grab(["主诉"]);
    let present = grab(["现病史"]);
    let past = grab(["既往史", "既往"]);
    let exam = grab(["体格检查", "查体", "体检"]);
    let aux = grab(["辅助检查", "化验", "检验", "影像"]);
    let diagnosis = grab(["诊断", "初步诊断"]);
    let differential = grab(["鉴别诊断"]);

    // 没有标签时，把整段塞进现病史
    if (!present && !chief && rawText) present = rawText.slice(0, 600);
    if (!chief && present) chief = present.split(/[。\n]/)[0].slice(0, 60);
    if (!diagnosis) diagnosis = "【待补充】请根据问诊信息推断";
    if (!differential) differential = "【待补充】";

    // 关键线索：从现病史抽取若干“症状短语”作为线索词
    const clueWords = [];
    const sentences = (present || "").split(/[。；;]/).map((s) => s.trim()).filter((s) => s.length >= 4);
    sentences.slice(0, 5).forEach((s) => {
      // 取短语：症状+表现
      const w = s.length > 14 ? s.slice(0, 14) : s;
      if (!clueWords.find((c) => c.word === w))
        clueWords.push({ word: w, info: s });
    });
    // 主诉也作为线索
    if (chief && !clueWords.find((c) => c.word === chief))
      clueWords.unshift({ word: chief, info: "患者主诉：" + chief });

    const patient = {
      name: "【姓名】",
      age: meta.age || "—",
      gender: meta.gender || "—",
      others: "【其他基本信息】",
    };

    const knowledge = {
      disease: diagnosis && diagnosis !== "【待补充】请根据问诊信息推断" ? "核心疾病：" + diagnosis : "请结合问诊与检查推断核心疾病。",
      inquiry: "问诊要点：围绕主诉展开，循序渐进地采集现病史（起病、部位、性质、程度、诱因、缓解加重因素、伴随症状），并关注既往史与用药。",
      differential: differential !== "【待补充】" ? differential : "鉴别诊断：列出 2-3 个需鉴别的疾病并说明依据。",
      clinicalTip: "临床提示：注意危险信号（如胸痛伴冷汗、腹痛伴腹膜刺激征），优先排查急重症。",
      humanistic: "人文关怀要点：主动自我介绍、保护隐私、用通俗语言解释、关注患者情绪、给予安抚与尊重。",
    };

    const c = {
      id: util.uid("case"),
      title,
      type,
      source: "hospital",
      reviewed: false,
      enabled: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      patient,
      chiefComplaint: chief,
      presentIllness: present,
      pastHistory: past || "【待补充】",
      exam: exam || "【待补充】",
      auxExam: aux || "【待补充】",
      diagnosis,
      differential: differential || "【待补充】",
      clues: clueWords.length ? clueWords : [{ word: "主诉", info: chief }],
      knowledge,
      quizzes: generateQuiz({
        title,
        type,
        diagnosis,
        chiefComplaint: chief,
        clues: clueWords,
        differential,
      }),
    };
    return c;
  }

  /* ---------------- 自动出题 ---------------- */
  function generateQuiz(c) {
    const diag = c.diagnosis && !c.diagnosis.startsWith("【") ? c.diagnosis : "该病例核心诊断";
    const cc = c.chiefComplaint || "患者主诉";
    const q = [];
    q.push({
      id: util.uid("q"),
      type: "choice",
      stem: `关于该病例的主诉「${cc}」，下列描述最符合的是？`,
      options: [
        "应围绕主诉系统采集现病史与鉴别信息",
        "主诉与诊断无关，可直接下结论",
        "主诉仅用于挂号，无需在问诊中追问",
        "主诉越长说明病情越轻",
      ],
      answer: 0,
      analysis: "主诉是患者就诊的主要原因，是问诊与鉴别诊断的起点，应系统追问。",
    });
    q.push({
      id: util.uid("q"),
      type: "choice",
      stem: `结合本例资料，最可能的诊断是？`,
      options: [
        diag,
        "与病史完全无关的常见病（干扰项 A）",
        "仅凭主诉即可确定的疾病（干扰项 B）",
        "无需检查即可排除的疾病（干扰项 C）",
      ],
      answer: 0,
      analysis: `本例资料显示最可能诊断为「${diag}」，需结合查体与辅助检查确认。`,
    });
    q.push({
      id: util.uid("q"),
      type: "choice",
      stem: `在鉴别诊断时，下列做法正确的是？`,
      options: [
        "列出 2-3 个需鉴别疾病并比较依据",
        "直接认定第一印象，不做鉴别",
        "只依赖影像学检查",
        "忽略既往史",
      ],
      answer: 0,
      analysis: "规范的鉴别诊断应列出候选疾病并比较支持/不支持点。",
    });
    q.push({
      id: util.uid("q"),
      type: "choice",
      stem: `在医患沟通中，体现人文关怀的做法是？`,
      options: [
        "主动安抚、用通俗语言解释、尊重患者意愿",
        "只问症状，不关注情绪",
        "打断患者陈述",
        "使用大量专业术语使患者难懂",
      ],
      answer: 0,
      analysis: "人文关怀要求关注患者情绪、保护隐私、通俗沟通、给予尊重。",
    });
    q.push({
      id: util.uid("q"),
      type: "short",
      stem: `请简述针对本病例的问诊思路与诊断依据（不少于 3 点）。`,
      reference:
        "评分要点：①围绕主诉系统采集现病史；②关注既往史、用药与危险因素；③合理选择查体与辅助检查；④列出鉴别诊断并说明依据；⑤体现人文关怀与医患沟通。",
      keyPoints: ["现病史", "既往史", "辅助检查", "鉴别诊断", "人文关怀"],
    });
    return q;
  }

  /* ---------------- 模拟患者对话 ---------------- */
  // 在英语模式下，给出一个尽量英文的回应（演示用；真实质量取决于大模型）
  const EN_GLOSSARY = {
    疼: "pain", 痛: "pain", 胸: "chest", 腹: "abdomen", 头: "head",
    发热: "fever", 咳嗽: "cough", 恶心: "nausea", 呕吐: "vomiting",
    头晕: "dizziness", 乏力: "fatigue", 呼吸: "breathing", 心慌: "palpitation",
  };
  function enTranslate(text) {
    let t = text;
    for (const [k, v] of Object.entries(EN_GLOSSARY)) {
      t = t.split(k).join(v);
    }
    return t;
  }

  function embedClues(text, clues, usedSet) {
    if (!clues) return text;
    let out = text;
    clues.forEach((cl) => {
      if (usedSet.has(cl.word)) return;
      const idx = out.indexOf(cl.word);
      if (idx >= 0) {
        out =
          out.slice(0, idx) + "[[" + cl.word + "]]" + out.slice(idx + cl.word.length);
        usedSet.add(cl.word);
      }
    });
    return out;
  }

  // 根据医生提问匹配病例内容，返回一段“事实”文本
  function matchFact(c, doctorText) {
    const t = doctorText || "";
    const lower = t.toLowerCase();
    if (/主诉|怎么了|哪里不舒服|来看病|什么问题|情况/.test(t)) {
      return c.chiefComplaint || c.presentIllness?.split(/[。\n]/)[0] || "我最近身体不太舒服。";
    }
    if (/多大|几岁|年龄|性别|男|女|基本信息|叫什么/.test(t)) {
      return `我是【姓名】，${c.patient?.gender || "患者"}，${c.patient?.age || "年龄"}。`;
    }
    if (/多久|什么时候开始|几天|多长时间|发作/.test(t)) {
      return c.presentIllness || "这个情况出现有一阵子了。";
    }
    if (/疼|痛|症状|感觉|怎么|哪儿|哪里/.test(t)) {
      // 返回现病史首句或随机线索
      return c.presentIllness || (c.clues[0] && c.clues[0].info) || "就是不太舒服。";
    }
    if (/以前|既往|病史|高血压|糖尿病|吃药|用药|过敏/.test(t)) {
      return c.pastHistory && c.pastHistory !== "【待补充】" ? c.pastHistory : "以前身体还行，没什么大病，药也很少吃。";
    }
    if (/检查|化验|抽血|片|ct|影|报告/.test(t)) {
      return c.auxExam && c.auxExam !== "【待补充】" ? c.auxExam : "之前做过一些检查，报告我不太看得懂。";
    }
    if (/查体|体检|按压|肚子|听诊/.test(t)) {
      return c.exam && c.exam !== "【待补充】" ? c.exam : "医生您帮我查查吧。";
    }
    if (/吃饭|睡眠|大小便|体重|休息/.test(t)) {
      return "最近吃不太好，睡也睡不踏实，整个人没精神。";
    }
    if (/诊断|是什么病|考虑|判断|结论/.test(t)) {
      return "医生，我也不知道自己到底是什么毛病，您帮我好好看看，我心里挺担心的。";
    }
    return null; // 未匹配
  }

  function detectEmpathy(text) {
    return /(您好|你好|别担心|不用担心|请|理解|放心|慢慢|不着急|我明白|我理解|安抚|辛苦|抱歉|陪您|会好|别怕|注意身体)/.test(
      text || ""
    );
  }

  function detectBlunt(text) {
    // 生硬：过短、命令式、无敬语
    const t = text || "";
    if (t.length < 6) return true;
    if (/^(说|讲|回答|回答我|快|立刻|马上)/.test(t)) return true;
    return false;
  }

  // 生成一条患者回复
  function patientReply(c, conversation, isEnglish) {
    const doctorMsgs = conversation.filter((m) => m.role === "doctor");
    const lastDoctor = doctorMsgs[doctorMsgs.length - 1];
    const usedSet = new Set();
    conversation
      .filter((m) => m.role === "patient")
      .forEach((m) => {
        (c.clues || []).forEach((cl) => {
          if (m.text.includes("[[" + cl.word + "]]") || m.text.includes(cl.word))
            usedSet.add(cl.word);
        });
      });

    const empathy = lastDoctor ? detectEmpathy(lastDoctor.text) : false;
    const blunt = lastDoctor ? detectBlunt(lastDoctor.text) : false;

    let fact = lastDoctor ? matchFact(c, lastDoctor.text) : null;
    let reply;

    if (!lastDoctor) {
      // 开场白
      reply = `医生您好，我是来就诊的${c.patient?.gender || "患者"}。${c.chiefComplaint || "我最近身体不太舒服"}，想请您帮我看看。`;
    } else if (blunt && !empathy) {
      reply =
        "（患者皱了皱眉）……医生，您别急，我有点紧张，您慢慢问我就好。我是觉得" +
        (c.chiefComplaint || "不太舒服") +
        "。";
    } else if (empathy) {
      reply =
        "（患者松了口气）谢谢您，听您这么说我心里踏实多了。其实我是" +
        (fact || c.chiefComplaint || "最近不太舒服") +
        "，您再问什么我都配合。";
    } else if (fact) {
      reply = "嗯，" + fact + "。您还想了解点什么，尽管问。";
    } else {
      // 未匹配：引导问诊，并主动带出一个未提及的线索
      const pending = (c.clues || []).find((cl) => !usedSet.has(cl.word));
      if (pending) {
        reply =
          "医生，您能再具体问问吗？比如" +
          pending.info +
          "这方面我也挺在意的。";
        usedSet.add(pending.word);
      } else {
        reply =
          "医生，我该说的都说了，您帮我判断判断到底是啥病吧，我有点担心。";
      }
    }

    // 嵌入线索词
    reply = embedClues(reply, c.clues, usedSet);

    if (isEnglish) {
      // 演示用：尽量英文；未知中文保留原词
      reply = "[EN Patient] " + enTranslate(reply.replace(/\[\[|\]\]/g, ""));
    }
    return reply;
  }

  /* ---------------- 演示病例种子数据 ---------------- */
  function seedDemoCases() {
    if (AIPS.store.getCases().length > 0) return;
    const demos = [
      {
        id: util.uid("case"),
        title: "中年男性反复胸痛伴出汗",
        type: "心血管科",
        source: "demo",
        reviewed: true,
        enabled: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        patient: { name: "【姓名】", age: "58", gender: "男", others: "吸烟史 30 年" },
        chiefComplaint: "阵发性胸骨后压榨性胸痛 2 小时",
        presentIllness:
          "2 小时前活动时突发胸骨后压榨性疼痛，伴大汗、左手麻木，休息后约 5 分钟缓解。近 1 周类似发作 3 次，每次持续数分钟。",
        pastHistory: "高血压 10 年，吸烟 30 年，否认糖尿病。",
        exam: "BP 150/95mmHg，心率 92 次/分，律齐，未闻及杂音。",
        auxExam: "心电图：V1-V4 ST 段抬高；肌钙蛋白 I 升高。",
        diagnosis: "急性 ST 段抬高型心肌梗死（前壁）",
        differential: "不稳定型心绞痛、主动脉夹层、急性心包炎。",
        clues: [
          { word: "胸骨后压榨性疼痛", info: "典型心绞痛/心梗胸痛性质，位于胸骨后，呈压榨、闷胀感。" },
          { word: "伴大汗", info: "自主神经兴奋表现，提示疼痛剧烈或循环应激，多见于急性心梗。" },
          { word: "左手麻木", info: "疼痛放射至左肩、左臂内侧或左手，是心肌缺血的典型放射痛。" },
          { word: "ST 段抬高", info: "心电图 V1-V4 ST 段抬高是前壁心肌梗死的特征性改变。" },
          { word: "肌钙蛋白升高", info: "心肌损伤特异性标志物，升高支持心肌梗死诊断。" },
        ],
        knowledge: {
          disease: "急性 ST 段抬高型心肌梗死（前壁）：冠脉急性闭塞导致心肌坏死，属心血管急症。",
          inquiry: "问诊要点：胸痛部位、性质、诱因、持续时间、缓解方式、放射痛、伴随症状（大汗、呼吸困难）、危险因素（高血压、吸烟）。",
          differential: "鉴别诊断：不稳定型心绞痛（ST 不抬高）、主动脉夹层（撕裂样痛、双上肢血压差）、急性心包炎（胸膜痛、广泛 ST 抬但 PR 压低）。",
          clinicalTip: "临床提示：突发胸痛伴大汗、放射痛须优先排查急性心梗，尽快心电图+肌钙蛋白，开通绿色通道。",
          humanistic: "人文关怀要点：安抚紧张情绪、简明解释检查必要性、尽快止痛并交代病情、尊重患者知情权。",
        },
        quizzes: generateQuiz({
          title: "中年男性反复胸痛伴出汗",
          type: "心血管科",
          diagnosis: "急性 ST 段抬高型心肌梗死（前壁）",
          chiefComplaint: "阵发性胸骨后压榨性胸痛 2 小时",
          clues: [{ word: "ST 段抬高" }],
          differential: "不稳定型心绞痛、主动脉夹层、急性心包炎。",
        }),
      },
      {
        id: util.uid("case"),
        title: "青年女性转移性右下腹痛",
        type: "外科",
        source: "demo",
        reviewed: true,
        enabled: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        patient: { name: "【姓名】", age: "22", gender: "女", others: "既往体健" },
        chiefComplaint: "腹痛 1 天，加重伴发热",
        presentIllness:
          "1 天前始于上腹隐痛，数小时后转移并固定于右下腹，呈持续性胀痛，伴恶心、低热，进食后加重。",
        pastHistory: "否认手术史及慢性病史。",
        exam: "麦氏点压痛、反跳痛及肌紧张，肠鸣音减弱。",
        auxExam: "血常规：白细胞及中性粒细胞升高；超声示阑尾增粗。",
        diagnosis: "急性阑尾炎",
        differential: "右侧输尿管结石、宫外孕破裂、急性胃肠炎、卵巢黄体破裂。",
        clues: [
          { word: "转移性右下腹痛", info: "阑尾炎典型病史：初为脐周/上腹痛，后转移固定于右下腹。" },
          { word: "麦氏点压痛", info: "脐与右髂前上棘连线中外 1/3 处压痛，是阑尾炎重要体征。" },
          { word: "反跳痛及肌紧张", info: "提示局部腹膜刺激征，提示化脓性/穿孔性阑尾炎可能。" },
          { word: "白细胞升高", info: "炎症指标升高支持急性阑尾炎诊断。" },
        ],
        knowledge: {
          disease: "急性阑尾炎：阑尾管腔阻塞继发细菌感染，是最常见的急腹症。",
          inquiry: "问诊要点：腹痛起始部位与转移过程、性质、伴随恶心呕吐发热、月经史（育龄女性排查妇科急腹症）。",
          differential: "鉴别诊断：右侧输尿管结石（绞痛、血尿）、宫外孕（停经、阴道出务）、卵巢黄体破裂、急性胃肠炎。",
          clinicalTip: "临床提示：转移性右下腹痛+麦氏点压痛是阑尾炎核心线索；育龄女性必须问月经史排除宫外孕。",
          humanistic: "人文关怀要点：缓解焦虑、解释为何需手术、关注疼痛、尊重隐私（尤其查体与妇科排查）。",
        },
        quizzes: generateQuiz({
          title: "青年女性转移性右下腹痛",
          type: "外科",
          diagnosis: "急性阑尾炎",
          chiefComplaint: "腹痛 1 天，加重伴发热",
          clues: [{ word: "转移性右下腹痛" }],
          differential: "右侧输尿管结石、宫外孕破裂、急性胃肠炎。",
        }),
      },
      {
        id: util.uid("case"),
        title: "学龄前儿童反复高热惊厥",
        type: "儿科",
        source: "demo",
        reviewed: true,
        enabled: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        patient: { name: "【姓名】", age: "4", gender: "男", others: "既往有 1 次热性惊厥史" },
        chiefComplaint: "发热 1 天，惊厥 1 次",
        presentIllness:
          "1 天前流涕、发热，最高 39.8℃，今晨突发双眼上翻、四肢抽动、意识丧失约 1 分钟，退热后精神可。",
        pastHistory: "既往类似热性惊厥 1 次；既往体健，疫苗接种正常。",
        exam: "神志清，咽充血，扁桃体 II 度肿大，心肺听诊无异常，神经系统查体阴性。",
        auxExam: "血常规：白细胞正常、淋巴比例偏高；CRP 轻度升高。",
        diagnosis: "急性上呼吸道感染伴热性惊厥",
        differential: "中枢神经系统感染（脑膜炎）、癫痫、电解质紊乱。",
        clues: [
          { word: "高热", info: "体温骤升常是热性惊厥的诱发因素，多发生在发热 24 小时内。" },
          { word: "双眼上翻、四肢抽动", info: "全身性惊厥表现，热性惊厥多为全身性强直-阵挛，历时短。" },
          { word: "热性惊厥史", info: "既往史有热性惊厥提示复发风险升高，属良性过程但需鉴别诊断。" },
          { word: "神经系统查体阴性", info: "热性惊厥患儿发作间期神经系统查体通常正常，支持良性诊断。" },
        ],
        knowledge: {
          disease: "热性惊厥：婴幼儿在发热状态下出现的惊厥，多为良性、自限，常见于 6 月-5 岁。",
          inquiry: "问诊要点：发热时长与峰值、惊厥表现与时点、既往惊厥史、家族史、伴随呼吸道/消化道症状、疫苗史。",
          differential: "鉴别诊断：中枢神经系统感染（持续嗜睡、颈强直）、癫痫（无热惊厥）、电解质紊乱。",
          clinicalTip: "临床提示：热性惊厥多为短暂全身发作，若惊厥时间长、局灶、退热后仍嗜睡需警惕 CNS 感染。",
          humanistic: "人文关怀要点：安抚家长恐慌、解释良性预后、指导居家退热与急救、避免家长自责。",
        },
        quizzes: generateQuiz({
          title: "学龄前儿童反复高热惊厥",
          type: "儿科",
          diagnosis: "急性上呼吸道感染伴热性惊厥",
          chiefComplaint: "发热 1 天，惊厥 1 次",
          clues: [{ word: "热性惊厥史" }],
          differential: "中枢神经系统感染、癫痫、电解质紊乱。",
        }),
      },
    ];
    demos.forEach((d) => AIPS.store.upsertCase(d));
  }

  return {
    dePrivacy,
    buildStructuredCase,
    generateQuiz,
    patientReply,
    seedDemoCases,
  };
})();
