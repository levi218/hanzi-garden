// Master list of most-used Chinese characters, grouped by HSK level.
// Strings are split into single characters; duplicates are removed
// (a char stays at the lowest level it appears in).

const hsk1 = `
一二三四五六七八九十零百个人我你他她它们不是的了在有这那哪谁什么吗呢
和很好大小多少上下前后里外中东西南北天年月日星期今明昨现时候分钟点半
岁号叫名字国汉语文学生老师同校家爸妈儿女子朋友先医院商店买卖钱块高兴
喜欢爱看见听说读写会能想要请谢对不起没关系再来去回开坐住工作做吃饭菜
米茶水果喝杯睡觉衣服电脑视影话机飞车出租猫狗热冷雨怎样都太漂亮打些书
桌椅面包午几
`;

const hsk2 = `
吧白帮报纸比别长唱歌常穿次从错但到得等第弟懂动房间非货已经就考试可课
快乐累离两路旅游慢忙每妹门条奶男难您牛旁边跑步便宜票妻起床千晴让日容
易身体生病手表送虽然踢足球题跳舞外完玩晚往为忘问瓜希望洗笑新姓休息雪
颜色眼睛羊肉药也意思阴因游泳右鱼远运动早丈夫找着真正知道准备走最左红
火站教给公共汽司近告诉哥咖啡孩还铅笔介绍务员再班零件事情场
`;

const hsk3 = `
阿姨啊矮安静把搬办法半饱抱被鼻较赛必须变化表示演冰箱才参加草层差超市
衬衫成绩城迟除船春词典聪段短锻炼饿耳朵发烧方放心复习附该敢感冒刚根据
跟更公园故事刮风关顾客怪馆惯河黑板护照花画坏环境换黄回答或者季节记检
查简单健康讲角脚接街结束解决借经理久旧句决定渴刻空调口哭裤筷蓝老虎礼
物历史脸练辆聊邻居楼绿马满帽拿内鸟努力爬盘胖皮鞋啤酒瓶其实奇骑清楚秋
裙情认为伞扫嗓声世界瘦叔舒树数双水平机太阳糖特疼提替甜头突然图腿碗万
位闻污染无相信香蕉像鞋信趣行李熊选需元愿越云张重主注自己总嘴刷牙终于
遇满意般搬爱好办公室半夜比如笔记本电梯灯地铁地图弄按照
`;

const seen = new Set();
const levels = { 1: [], 2: [], 3: [] };
for (const [lvl, raw] of [[1, hsk1], [2, hsk2], [3, hsk3]]) {
  for (const ch of raw.replace(/\s/g, "")) {
    // keep CJK unified ideographs only
    if (!/\p{Script=Han}/u.test(ch)) continue;
    if (seen.has(ch)) continue;
    seen.add(ch);
    levels[lvl].push(ch);
  }
}

const total = levels[1].length + levels[2].length + levels[3].length;
console.log(`HSK1: ${levels[1].length}  HSK2: ${levels[2].length}  HSK3: ${levels[3].length}  TOTAL: ${total}`);

export default levels;
