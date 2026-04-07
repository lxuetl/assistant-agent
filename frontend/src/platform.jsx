import React, { useState, useRef, useEffect } from 'react';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';

export default function UserPortal() {
  // ==========================================
  // 🌟 全局状态：控制是否登录以及当前身份
  // ==========================================
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [role, setRole] = useState('student'); // 'student' 默认选学生端
  const [accountId, setAccountId] = useState(''); // 🌟 新增：记录登录的账号(学号/工号)

  // ==========================================
  // 🌟 内部状态：A25 主功能区状态
  // ==========================================
  const [activeTab, setActiveTab] = useState('report');
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // 👩‍🏫 教师端的全班大盘数据
  const [classData, setClassData] = useState({
    radar: [], bar: [], weakest: '', total: 0
  });

  // 👨‍🎓 学生端的个人专属真实数据 (从数据库拉取)
  const [myScoreData, setMyScoreData] = useState({
    radar: [], weakest: '', name: ''
  });

  const [questionText, setQuestionText] = useState('');
  const [fileData, setFileData] = useState(null);
  const [fileType, setFileType] = useState('');
  const [isGrading, setIsGrading] = useState(false);
  const [gradingResult, setGradingResult] = useState(null);
  const [annotatedFile, setAnnotatedFile] = useState(null);

  // ==========================================
  // 🌟 AI 助手核心状态与联动逻辑
  // ==========================================
  const [messages, setMessages] = useState([
    { role: 'assistant', content: '你好！我是 A25 智能助教 🤖。系统检测到你最近的学习状态不错，今天遇到什么难题了吗？（你可以直接向我提问，或者让我帮你总结知识点）' }
  ]);
  const [inputText, setInputText] = useState('');
  const [isChatting, setIsChatting] = useState(false);
  const chatEndRef = useRef(null);
  const [hasPromptedWeakness, setHasPromptedWeakness] = useState(false);

  // 1. 自动滚动到最新消息
  useEffect(() => {
    if (activeTab === 'agent' && chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, activeTab, isChatting]);

  // 2. 🌟 核心拦截器：学生一登录，就去后端真正的数据库里取分！
  useEffect(() => {
    if (isLoggedIn && role === 'student' && accountId) {
      fetch(`http://localhost:8000/api/my_score?account_id=${accountId}`)
        .then(res => res.json())
        .then(data => {
          if (data.status === 'success') {
            setMyScoreData({
              radar: data.radar_data,
              weakest: data.weakest_subject,
              name: data.student_name
            });
          }
        })
        .catch(err => console.error("从数据库拉取成绩失败:", err));
    }
  }, [isLoggedIn, role, accountId]);

  // 3. 🌟 终极杀招：千人千面的真实学情联动闭环
  useEffect(() => {
    // 动态决定依据：学生看个人最弱，老师看全班最弱
    const targetWeakest = role === 'student' ? myScoreData.weakest : classData.weakest;
    const targetName = role === 'student' ? (myScoreData.name || '同学') : '王老师';

    if (activeTab === 'agent' && targetWeakest && targetWeakest !== '暂无' && !hasPromptedWeakness) {
      let proactiveMessage = {};

      if (role === 'student') {
        // 👨‍🎓 学生视角：基于数据库真实数据推送练习
        proactiveMessage = {
          role: 'assistant',
          content: `🚨 【个人学情诊断】\n${targetName}，系统底层调取了你在数据库的成绩画像，发现你在《${targetWeakest}》模块存在明显薄弱环节。\n\n作为你的专属AI助教，我已经为你调取了该知识点的核心考纲。需要我立刻为你出两道针对性的实战题练练手吗？💪`
        };
      } else {
        // 👩‍🏫 教师视角：辅助教研
        proactiveMessage = {
          role: 'assistant',
          content: `📊 【班级学情诊断报告】\n${targetName}，系统已完成当前班级成绩单的深度挖掘。数据显示，全班在《${targetWeakest}》模块存在集体性的知识薄弱。\n\n💡 智能教学干预建议：\n1. 建议在下节课安排 15-20 分钟的专项复习。\n2. 是否需要我为您一键生成针对该薄弱点的【补救教案】或【专项随堂测验】发放给学生？`
        };
      }

      setMessages(prev => [...prev, proactiveMessage]);
      setHasPromptedWeakness(true);
    }
  }, [activeTab, myScoreData.weakest, classData.weakest, hasPromptedWeakness, role, myScoreData.name]);

  // 4. 发送消息核心逻辑 (完美适配后端 StreamingResponse)
  const handleSendMessage = async () => {
    if (!inputText.trim() || isChatting) return;

    const userText = inputText;
    const newMessages = [...messages, { role: 'user', content: userText }];

    // 先把用户的话上屏，同时追加一个空的 AI 气泡，用来“接”流式输出的字
    setMessages([...newMessages, { role: 'assistant', content: '' }]);
    setInputText('');
    setIsChatting(true);

    try {
      const res = await fetch('http://localhost:8000/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newMessages,
          user_id: accountId || (role === 'student' ? 'student_001' : 'teacher_001'),
          course_id: 'default_course',
          platform: 'web'
        })
      });

      if (!res.ok) throw new Error("网络请求失败");
      if (!res.body) throw new Error("当前浏览器不支持ReadableStream");

      // 🌟 核心魔法：开启流式读取管道
      const reader = res.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let done = false;
      let aiFullReply = '';

      // 循环读取后端吐出的每一个数据块
      while (!done) {
        const { value, done: readerDone } = await reader.read();
        done = readerDone;
        if (value) {
          // 解码数据块
          const chunk = decoder.decode(value, { stream: true });
          aiFullReply += chunk;

          // 动态将大模型吐出的字更新到最后一个气泡中
          setMessages(prev => {
            const updatedMessages = [...prev];
            updatedMessages[updatedMessages.length - 1].content = aiFullReply;
            return updatedMessages;
          });
        }
      }
    } catch (err) {
      console.error(err);
      // 错误回退处理
      setMessages(prev => {
        const updatedMessages = [...prev];
        updatedMessages[updatedMessages.length - 1].content = '❌ 神经网络连接波动，请检查 FastAPI 后端或大模型密钥是否正常。';
        return updatedMessages;
      });
    } finally {
      setIsChatting(false);
    }
  };

  const jumpToPlatform = (url) => {
    window.open(url, '_blank');
  };

  // ==========================================
  // 🎨 独立登录页 UI (未登录时显示)
  // ==========================================
  if (!isLoggedIn) {
    return (
      <div style={{ display: 'flex', height: '100vh', width: '100vw', backgroundColor: '#f0f2f5', justifyContent: 'center', alignItems: 'center', fontFamily: 'sans-serif' }}>
        <div style={{ backgroundColor: '#fff', width: '400px', borderRadius: '16px', boxShadow: '0 8px 24px rgba(0,0,0,0.08)', overflow: 'hidden', animation: 'fadeIn 0.5s' }}>

          <div style={{ backgroundColor: '#1677ff', padding: '32px 0', textAlign: 'center', color: '#fff' }}>
            <div style={{ fontSize: '48px', marginBottom: '8px' }}>🎓</div>
            <h1 style={{ margin: 0, fontSize: '24px', letterSpacing: '2px' }}>A25 智能学习中心</h1>
            <p style={{ margin: '8px 0 0 0', opacity: 0.8, fontSize: '14px' }}>数据驱动的下一代教育平台</p>
          </div>

          <div style={{ padding: '32px' }}>
            <div style={{ display: 'flex', marginBottom: '24px', backgroundColor: '#f5f7fa', borderRadius: '8px', padding: '4px' }}>
              <div
                onClick={() => setRole('student')}
                style={{ flex: 1, textAlign: 'center', padding: '10px 0', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', transition: 'all 0.3s', backgroundColor: role === 'student' ? '#fff' : 'transparent', color: role === 'student' ? '#1677ff' : '#999', boxShadow: role === 'student' ? '0 2px 8px rgba(0,0,0,0.05)' : 'none' }}
              >
                👨‍🎓 学生端
              </div>
              <div
                onClick={() => setRole('teacher')}
                style={{ flex: 1, textAlign: 'center', padding: '10px 0', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', transition: 'all 0.3s', backgroundColor: role === 'teacher' ? '#fff' : 'transparent', color: role === 'teacher' ? '#52c41a' : '#999', boxShadow: role === 'teacher' ? '0 2px 8px rgba(0,0,0,0.05)' : 'none' }}
              >
                👨‍🏫 教师端
              </div>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontSize: '13px', color: '#666', marginBottom: '8px', fontWeight: 'bold' }}>账号</div>
              {/* 🌟 核心双向绑定：真实连接 accountId */}
              <input
                type="text"
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                placeholder={role === 'student' ? "输入学号 (如刚才表格中的 20041001)" : "请输入教工号 (如: T8001)"}
                style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #d9d9d9', outline: 'none', boxSizing: 'border-box' }}
              />
            </div>
            <div style={{ marginBottom: '32px' }}>
              <div style={{ fontSize: '13px', color: '#666', marginBottom: '8px', fontWeight: 'bold' }}>密码</div>
              <input type="password" placeholder="请输入密码" style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #d9d9d9', outline: 'none', boxSizing: 'border-box' }} />
            </div>

            <button
              onClick={() => setIsLoggedIn(true)}
              style={{ width: '100%', padding: '14px', borderRadius: '8px', border: 'none', backgroundColor: role === 'student' ? '#1677ff' : '#52c41a', color: '#fff', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer', transition: 'background 0.3s', boxShadow: role === 'student' ? '0 4px 12px rgba(22,119,255,0.3)' : '0 4px 12px rgba(82,196,26,0.3)' }}
            >
              登 录 系 统
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ==========================================
  // 💻 登录后的主系统界面
  // ==========================================
  return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw', backgroundColor: '#f5f7fa', fontFamily: 'sans-serif' }}>

      {/* 👈 左侧：第三方平台转接枢纽 */}
      <div style={{ width: '240px', backgroundColor: '#fff', borderRight: '1px solid #ebeef5', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '24px 20px', fontSize: '20px', fontWeight: 'bold', color: '#1677ff', borderBottom: '1px solid #ebeef5', display: 'flex', alignItems: 'center' }}>
          <span style={{ fontSize: '24px', marginRight: '8px' }}>🎓</span> A25 学习中心
        </div>

        <div style={{ padding: '20px', flex: 1 }}>
          <div style={{ marginBottom: '16px', fontSize: '13px', color: '#999', fontWeight: 'bold' }}>我的教学平台</div>
          <button onClick={() => jumpToPlatform('https://i.chaoxing.com/')} style={{ width: '100%', padding: '12px 16px', marginBottom: '12px', backgroundColor: '#f0f2f5', border: 'none', borderRadius: '8px', cursor: 'pointer', textAlign: 'left', fontWeight: 'bold', color: '#333' }}>📘 超星学习通</button>
          <button onClick={() => jumpToPlatform('https://www.yuketang.cn/')} style={{ width: '100%', padding: '12px 16px', marginBottom: '12px', backgroundColor: '#f0f2f5', border: 'none', borderRadius: '8px', cursor: 'pointer', textAlign: 'left', fontWeight: 'bold', color: '#333' }}>🌂 雨课堂</button>
          <button onClick={() => jumpToPlatform('https://www.zhihuishu.com/')} style={{ width: '100%', padding: '12px 16px', marginBottom: '12px', backgroundColor: '#f0f2f5', border: 'none', borderRadius: '8px', cursor: 'pointer', textAlign: 'left', fontWeight: 'bold', color: '#333' }}>🌳 智慧树</button>
        </div>

        <div style={{ padding: '20px', borderTop: '1px solid #ebeef5' }}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: '16px' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '50%', backgroundColor: role === 'student' ? '#1677ff' : '#52c41a', color: '#fff', display: 'flex', justifyContent: 'center', alignItems: 'center', fontWeight: 'bold', marginRight: '12px' }}>
              {role === 'student' ? (myScoreData.name ? myScoreData.name[0] : '李') : '王'}
            </div>
            <div>
              <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#333' }}>
                {role === 'student' ? `${myScoreData.name || '李'}同学` : '王老师 (教授)'}
              </div>
              <div style={{ fontSize: '12px', color: '#999' }}>计算机科学与技术</div>
            </div>
          </div>
          <button
            onClick={() => {
              setIsLoggedIn(false);
              setRole('student');
              // 退出时清空所有的痕迹，模拟真实的重新登录
              setAccountId('');
              setHasPromptedWeakness(false);
              setClassData({ radar: [], bar: [], weakest: '', total: 0 });
              setMyScoreData({ radar: [], weakest: '', name: '' });
              setMessages([{ role: 'assistant', content: '你好！我是 A25 智能助教 🤖。系统检测到你最近的学习状态不错，今天遇到什么难题了吗？（你可以直接向我提问，或者让我帮你总结知识点）' }]);
            }}
            style={{ width: '100%', padding: '8px 0', backgroundColor: '#fff', border: '1px solid #ff4d4f', color: '#ff4d4f', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', transition: 'all 0.2s' }}
            onMouseOver={(e) => { e.target.style.backgroundColor = '#fff1f0' }}
            onMouseOut={(e) => { e.target.style.backgroundColor = '#fff' }}
          >
            🚪 退出登录
          </button>
        </div>
      </div>

      {/* 👉 右侧：A25 主功能区 */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        <div style={{ height: '64px', backgroundColor: '#fff', borderBottom: '1px solid #ebeef5', display: 'flex', alignItems: 'center', padding: '0 32px', gap: '32px', flexShrink: 0 }}>
          {[
            { id: 'report', label: '📊 学情大屏' },
            { id: 'grading', label: '📝 智能批改' },
            { id: 'agent', label: '🤖 AI 助手' }
          ].map(tab => (
            <div key={tab.id} onClick={() => setActiveTab(tab.id)} style={{ cursor: 'pointer', fontWeight: activeTab === tab.id ? 'bold' : 'normal', color: activeTab === tab.id ? '#1677ff' : '#666', borderBottom: activeTab === tab.id ? '3px solid #1677ff' : '3px solid transparent', padding: '20px 0', transition: 'all 0.2s' }}>
              {tab.label}
            </div>
          ))}
        </div>

        <div style={{ flex: 1, padding: '32px', overflowY: 'auto' }}>

          {/* 🌟 学情大屏 */}
          {activeTab === 'report' && (
             <div style={{ animation: 'fadeIn 0.4s', maxWidth: '1000px' }}>

               {/* 👨‍🎓 学生视角：绑定真实数据库的 myScoreData */}
               {role === 'student' && (
                 <>
                   <h2 style={{ margin: '0 0 24px 0', color: '#333', display: 'flex', alignItems: 'center' }}>
                     <span style={{fontSize:'28px', marginRight:'8px'}}>📊</span> {myScoreData.name || '同学'} - 个人能力跨度分析
                   </h2>
                   <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                     <div style={{ backgroundColor: '#fff', padding: '24px', borderRadius: '12px', border: '1px solid #ebeef5', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
                       <h3 style={{ marginTop: 0, color: '#555', fontSize: '16px', textAlign: 'center' }}>当前知识点掌握度 (数据库真实同步)</h3>
                       <div style={{ height: '300px' }}>
                         <ResponsiveContainer width="100%" height="100%">
                           <RadarChart cx="50%" cy="50%" outerRadius="70%" data={myScoreData.radar.length > 0 ? myScoreData.radar : [{subject: '暂无数据', A: 0, fullMark: 100}]}>
                             <PolarGrid />
                             <PolarAngleAxis dataKey="subject" tick={{ fill: '#666', fontSize: 12 }} />
                             <PolarRadiusAxis angle={30} domain={[0, 100]} />
                             <Radar name={myScoreData.name || "该生"} dataKey="A" stroke="#1677ff" fill="#1677ff" fillOpacity={0.6} />
                           </RadarChart>
                         </ResponsiveContainer>
                       </div>
                     </div>
                     <div style={{ backgroundColor: '#fff', padding: '24px', borderRadius: '12px', border: '1px solid #ebeef5', boxShadow: '0 4px 12px rgba(0,0,0,0.05)', display: 'flex', flexDirection: 'column' }}>
                       <h3 style={{ marginTop: 0, color: '#cf1322', fontSize: '16px', borderBottom: '1px solid #ffe58f', paddingBottom: '8px' }}>🚨 核心薄弱点预警</h3>
                       <p style={{ color: '#555', lineHeight: '1.6', flex: 1 }}>
                         根据底层数据库的成绩画像，A25 引擎发现你在 <strong>《{myScoreData.weakest || '未知'}》</strong> 模块上得分较低，远低于及格基准。<br/><br/>
                         <strong>💡 AI 学习建议：</strong>建议前往 AI 助手界面，输入：“请给我出 3 道相关专项训练题”。
                       </p>
                       <button onClick={() => setActiveTab('agent')} style={{ padding: '12px', backgroundColor: '#1677ff', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>去找 AI 助教加练 🚀</button>
                     </div>
                   </div>
                 </>
               )}

               {/* 👩‍🏫 教师视角：保持原有大盘功能 */}
               {role === 'teacher' && (
                 <>
                   <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '24px' }}>
                     <h2 style={{ margin: 0, color: '#333', display: 'flex', alignItems: 'center' }}>
                       <span style={{fontSize:'28px', marginRight:'8px'}}>👨‍🏫</span> 25计算机班 - 动态学情诊断看板
                     </h2>
                     <div style={{ position: 'relative', overflow: 'hidden' }}>
                       <button style={{ backgroundColor: '#52c41a', color: '#fff', padding: '10px 20px', borderRadius: '8px', border: 'none', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', boxShadow: '0 4px 12px rgba(82,196,26,0.3)' }}>
                         {isAnalyzing ? '⏳ 数据急速挖掘与入库中...' : '📂 导入成绩单入库 (CSV/Excel)'}
                       </button>
                       <input
                         type="file"
                         accept=".csv,.xls,.xlsx"
                         onChange={async (e) => {
                           const file = e.target.files[0];
                           if (!file) return;
                           setIsAnalyzing(true);
                           const formData = new FormData();
                           formData.append('file', file);
                           try {
                             const res = await fetch('http://localhost:8000/api/analyze_scores', {
                               method: 'POST',
                               body: formData
                             });
                             const data = await res.json();
                             if (data.status === 'success') {
                               setClassData({
                                 radar: data.radar_data,
                                 bar: data.bar_data,
                                 weakest: data.weakest_subject,
                                 total: data.total_students
                               });
                               alert("✅ 成绩已分析并成功录入数据库！学生可以登录查分了。");
                             } else {
                               alert("分析失败：" + data.error);
                             }
                           } catch (err) {
                             alert("请求失败，请检查后端运行状态！");
                           } finally {
                             setIsAnalyzing(false);
                             e.target.value = null;
                           }
                         }}
                         style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer' }}
                       />
                     </div>
                   </div>

                   {classData.total > 0 ? (
                     <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', animation: 'fadeIn 0.5s' }}>
                       <div style={{ backgroundColor: '#fff', padding: '24px', borderRadius: '12px', border: '1px solid #ebeef5', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
                         <h3 style={{ marginTop: 0, color: '#555', fontSize: '16px', textAlign: 'center' }}>全班科目平均分雷达图 (共 {classData.total} 人)</h3>
                         <div style={{ height: '300px' }}>
                           <ResponsiveContainer width="100%" height="100%">
                             <RadarChart cx="50%" cy="50%" outerRadius="70%" data={classData.radar}>
                               <PolarGrid />
                               <PolarAngleAxis dataKey="subject" tick={{ fill: '#666', fontSize: 12 }} />
                               <PolarRadiusAxis angle={30} domain={[0, 100]} />
                               <Radar name="全班平均分" dataKey="A" stroke="#1677ff" fill="#1677ff" fillOpacity={0.6} />
                               <Tooltip />
                             </RadarChart>
                           </ResponsiveContainer>
                         </div>
                       </div>

                       <div style={{ backgroundColor: '#fff', padding: '24px', borderRadius: '12px', border: '1px solid #ebeef5', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
                         <h3 style={{ marginTop: 0, color: '#555', fontSize: '16px', textAlign: 'center' }}>《{classData.weakest}》分数段分布情况</h3>
                         <div style={{ height: '300px', marginTop: '10px' }}>
                           <ResponsiveContainer width="100%" height="100%">
                             <BarChart data={classData.bar} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                               <CartesianGrid strokeDasharray="3 3" vertical={false} />
                               <XAxis dataKey="name" tick={{ fill: '#666', fontSize: 12 }} />
                               <YAxis />
                               <Tooltip cursor={{fill: '#f5f5f5'}} />
                               <Bar dataKey="人数" fill="#ff4d4f" radius={[4, 4, 0, 0]} barSize={40} />
                             </BarChart>
                           </ResponsiveContainer>
                         </div>
                       </div>
                     </div>
                   ) : (
                     <div style={{ backgroundColor: '#fafafa', border: '2px dashed #d9d9d9', borderRadius: '12px', padding: '60px', textAlign: 'center', color: '#999' }}>
                       <span style={{ fontSize: '48px' }}>📂</span>
                       <h3 style={{ margin: '16px 0 8px 0', color: '#666' }}>暂无班级数据</h3>
                       <p>请点击右上角导入成绩单文件，以将全班成绩持久化到数据库中</p>
                     </div>
                   )}
                 </>
               )}
             </div>
          )}

          {/* 📝 智能批改区 */}
          {activeTab === 'grading' && (
            <div style={{ animation: 'fadeIn 0.3s', maxWidth: '800px' }}>
              <h2 style={{ margin: '0 0 24px 0', color: '#333' }}>智能作业批注系统</h2>
              <div style={{ backgroundColor: '#fff', padding: '32px', borderRadius: '12px', border: '1px solid #ebeef5', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                <div style={{ marginBottom: '24px' }}>
                  <div style={{ fontWeight: 'bold', color: '#333', marginBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                      <span style={{ width: '24px', height: '24px', backgroundColor: '#1677ff', color: '#fff', borderRadius: '50%', display: 'flex', justifyContent: 'center', alignItems: 'center', marginRight: '8px', fontSize: '14px' }}>1</span>
                      原题内容：
                    </div>
                    <div style={{ position: 'relative', overflow: 'hidden', display: 'inline-block' }}>
                      <button style={{ padding: '6px 12px', backgroundColor: '#f0f2f5', border: '1px solid #d9d9d9', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', color: '#666' }}>
                        📎 自动提取 Word/PDF
                      </button>
                      <input
                        type="file"
                        accept=".pdf,.docx"
                        onChange={async (e) => {
                          const file = e.target.files[0];
                          if (!file) return;
                          setQuestionText("正在拼命读取文档内容，请稍候...");
                          const formData = new FormData();
                          formData.append('file', file);
                          try {
                            const res = await fetch('http://localhost:8000/api/parse_question_file', { method: 'POST', body: formData });
                            const data = await res.json();
                            if (data.status === 'success') setQuestionText(data.text);
                            else { alert("解析失败：" + data.error); setQuestionText(""); }
                          } catch (err) { alert("网络错误！"); setQuestionText(""); }
                          e.target.value = null;
                        }}
                        style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer' }}
                      />
                    </div>
                  </div>
                  <textarea value={questionText} onChange={(e) => setQuestionText(e.target.value)} placeholder="输入原题内容..." style={{ width: '100%', height: '100px', padding: '12px', borderRadius: '8px', border: '1px solid #d9d9d9', resize: 'vertical', outline: 'none' }} />
                </div>

                <div>
                  <div style={{ fontWeight: 'bold', color: '#333', marginBottom: '12px', display: 'flex', alignItems: 'center' }}>
                    <span style={{ width: '24px', height: '24px', backgroundColor: '#1677ff', color: '#fff', borderRadius: '50%', display: 'flex', justifyContent: 'center', alignItems: 'center', marginRight: '8px', fontSize: '14px' }}>2</span>
                    上传解答：
                  </div>
                  <div style={{ border: '2px dashed #1677ff', backgroundColor: fileData ? '#f6ffed' : '#e6f4ff', borderRadius: '12px', padding: '30px', textAlign: 'center', position: 'relative' }}>
                    <input
                      type="file"
                      accept="image/*,.c,.cpp,.py,.txt,.docx"
                      onChange={(e) => {
                        const file = e.target.files[0];
                        if (!file) return;
                        const reader = new FileReader();
                        if (file.type.startsWith('image/') || file.name.endsWith('.docx')) {
                          setFileType(file.type.startsWith('image/') ? 'image' : 'docx');
                          reader.readAsDataURL(file);
                        } else {
                          setFileType('text');
                          reader.readAsText(file);
                        }
                        reader.onload = () => setFileData(reader.result);
                      }}
                      style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer' }}
                    />
                    <span style={{ fontSize: '40px' }}>{fileData ? '✅' : '📤'}</span>
                    <h3 style={{ margin: '16px 0 8px 0', color: fileData ? '#52c41a' : '#1677ff' }}>
                      {fileData ? '文件已就绪，点击重新选择' : '点击上传作业'}
                    </h3>
                  </div>
                </div>

                <button
                  disabled={!questionText || !fileData || isGrading}
                  onClick={async () => {
                    setIsGrading(true); setGradingResult(null); setAnnotatedFile(null);
                    try {
                      const res = await fetch('http://localhost:8000/api/grade_homework', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ user_id: accountId || "demo", course_id: "demo", question_text: questionText, content_type: fileType, content: fileData })
                      });
                      const data = await res.json();
                      if (data.status === 'success') {
                         setGradingResult(JSON.parse(data.grading_result));
                         if (data.annotated_file) setAnnotatedFile(data.annotated_file);
                      } else { alert("出错：" + JSON.stringify(data)); }
                    } catch (err) { alert("请求失败！"); } finally { setIsGrading(false); }
                  }}
                  style={{ width: '100%', marginTop: '32px', padding: '14px 0', backgroundColor: (questionText && fileData && !isGrading) ? '#1677ff' : '#ccc', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '16px', fontWeight: 'bold', cursor: (questionText && fileData && !isGrading) ? 'pointer' : 'not-allowed' }}
                >
                  {isGrading ? '⏳ AI 正在深度批阅...' : '✨ 开始智能批阅'}
                </button>
              </div>

              {gradingResult && (
                <div style={{ marginTop: '24px', backgroundColor: '#fff', padding: '32px', borderRadius: '12px', border: '1px solid #b7eb8f', borderTop: '6px solid #52c41a', boxShadow: '0 4px 12px rgba(82,196,26,0.1)', animation: 'fadeIn 0.5s' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <h2 style={{ margin: 0, color: '#333' }}>批改报告单</h2>
                    <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#52c41a' }}>{gradingResult.overall_score} <span style={{fontSize:'16px', color:'#999'}}>分</span></div>
                  </div>
                  <p style={{ fontSize: '16px', color: '#555', backgroundColor: '#f6ffed', padding: '12px 16px', borderRadius: '8px' }}>
                    <strong>👨‍🏫 教授点评：</strong>{gradingResult.summary}
                  </p>
                  <h3 style={{ marginTop: '24px', color: '#333', borderBottom: '1px solid #eee', paddingBottom: '8px' }}>📝 细节批注：</h3>
                  {gradingResult.annotations.map((ann, idx) => (
                    <div key={idx} style={{ marginBottom: '20px', padding: '16px', backgroundColor: '#fffaf0', borderLeft: '4px solid #faad14', borderRadius: '0 8px 8px 0' }}>
                      <div style={{ fontWeight: 'bold', color: '#d46b08', marginBottom: '8px' }}>📍 {ann.location}</div>
                      <div style={{ color: '#cf1322', marginBottom: '8px', fontSize: '14px' }}><strong>❌ 问题：</strong>{ann.explanation}</div>
                      <div style={{ color: '#08979c', fontSize: '14px' }}><strong>💡 建议：</strong>{ann.suggestion}</div>
                    </div>
                  ))}
                  {annotatedFile && (
                    <button onClick={() => { const a = document.createElement('a'); a.href = annotatedFile; a.download = 'AI批注.docx'; a.click(); }} style={{ marginTop: '24px', padding: '12px 24px', width: '100%', backgroundColor: '#52c41a', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '16px' }}>
                      📥 下载 AI 批注原文件
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* 🌟 完整的气泡聊天 UI */}
          {activeTab === 'agent' && (
             <div style={{ animation: 'fadeIn 0.3s', display: 'flex', flexDirection: 'column', height: 'calc(100vh - 150px)', maxWidth: '800px', margin: '0 auto' }}>
             <h2 style={{ margin: '0 0 16px 0', color: '#333' }}>专属 AI 辅导空间</h2>

             <div style={{ backgroundColor: '#fff', flex: 1, borderRadius: '12px', border: '1px solid #ebeef5', display: 'flex', flexDirection: 'column', padding: '20px', boxShadow: '0 4px 16px rgba(0,0,0,0.05)', overflow: 'hidden' }}>

               <div style={{ flex: 1, overflowY: 'auto', paddingRight: '10px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                 {messages.map((msg, idx) => (
                   <div key={idx} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                     {/* 机器人头像 */}
                     {msg.role === 'assistant' && <div style={{ width: '32px', height: '32px', borderRadius: '50%', backgroundColor: '#e6f4ff', display: 'flex', justifyContent: 'center', alignItems: 'center', marginRight: '12px', fontSize: '18px', flexShrink: 0 }}>🤖</div>}

                     {/* 气泡内容 */}
                     <div style={{
                       maxWidth: '75%',
                       padding: '12px 16px',
                       borderRadius: msg.role === 'user' ? '16px 0 16px 16px' : '0 16px 16px 16px',
                       backgroundColor: msg.role === 'user' ? '#1677ff' : '#f5f7fa',
                       color: msg.role === 'user' ? '#fff' : '#333',
                       lineHeight: '1.6',
                       fontSize: '15px',
                       boxShadow: '0 2px 4px rgba(0,0,0,0.02)',
                       whiteSpace: 'pre-wrap'
                     }}>
                       {msg.content}
                     </div>

                     {/* 用户头像 */}
                     {msg.role === 'user' && <div style={{ width: '32px', height: '32px', borderRadius: '50%', backgroundColor: '#1677ff', color: '#fff', display: 'flex', justifyContent: 'center', alignItems: 'center', marginLeft: '12px', fontSize: '14px', flexShrink: 0 }}>{role === 'student' ? (myScoreData.name ? myScoreData.name[0] : '李') : '王'}</div>}
                   </div>
                 ))}

                 {isChatting && (
                   <div style={{ display: 'flex', justifyContent: 'flex-start', animation: 'pulse 1.5s infinite' }}>
                     <div style={{ width: '32px', height: '32px', borderRadius: '50%', backgroundColor: '#e6f4ff', display: 'flex', justifyContent: 'center', alignItems: 'center', marginRight: '12px', fontSize: '18px', flexShrink: 0 }}>🤖</div>
                     <div style={{ padding: '12px 16px', borderRadius: '0 16px 16px 16px', backgroundColor: '#f5f7fa', color: '#999', fontSize: '14px' }}>
                       正在高速思考中... ⚡
                     </div>
                   </div>
                 )}
                 <div ref={chatEndRef} />
               </div>

               {/* 输入发送区 */}
               <div style={{ display: 'flex', gap: '12px', marginTop: '16px', borderTop: '1px solid #ebeef5', paddingTop: '20px' }}>
                 <input
                   type="text"
                   value={inputText}
                   onChange={(e) => setInputText(e.target.value)}
                   onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                   placeholder="输入你的问题，按回车键发送..."
                   style={{ flex: 1, padding: '14px 16px', borderRadius: '8px', border: '1px solid #d9d9d9', outline: 'none', fontSize: '15px', transition: 'border 0.3s' }}
                   onFocus={(e) => e.target.style.borderColor = '#1677ff'}
                   onBlur={(e) => e.target.style.borderColor = '#d9d9d9'}
                 />
                 <button
                   disabled={!inputText.trim() || isChatting}
                   onClick={handleSendMessage}
                   style={{ padding: '0 32px', backgroundColor: inputText.trim() && !isChatting ? '#1677ff' : '#ccc', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 'bold', fontSize: '15px', cursor: inputText.trim() && !isChatting ? 'pointer' : 'not-allowed', transition: 'all 0.3s' }}
                 >
                   发 送
                 </button>
               </div>
             </div>
           </div>
          )}

        </div>
      </div>
    </div>
  );
}