import React, { useState, useRef, useEffect } from 'react';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
// 🌟 引入刚刚写好的组件
import TargetedPractice from './TargetedPractice';
import AgentBuilder from './AgentBuilder';

export default function UserPortal() {
  // ==========================================
  //  全局状态：控制是否登录以及当前身份
  // ========================================== 
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [role, setRole] = useState('student');
  const [accountId, setAccountId] = useState('');
  const [showRegister, setShowRegister] = useState(false);
  const [registerData, setRegisterData] = useState({
    account_id: '',
    password: '',
    name: '',
    role: 'student'
  });
  // ==========================================
  //  内部状态：A25 主功能区状态
  // ==========================================
  const [activeTab, setActiveTab] = useState('report');
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const [classData, setClassData] = useState({ radar: [], bar: [], weakest: '', total: 0 });
  const [myScoreData, setMyScoreData] = useState({ radar: [], weakest: '', name: '' });

  const [questionText, setQuestionText] = useState('');
  const [fileData, setFileData] = useState(null);
  const [fileType, setFileType] = useState('');
  const [isGrading, setIsGrading] = useState(false);
  const [gradingResult, setGradingResult] = useState(null);
  const [annotatedFile, setAnnotatedFile] = useState(null);

  // ==========================================
  //  AI 助手核心状态与联动逻辑
  // ==========================================
  const [messages, setMessages] = useState([
    { role: 'assistant', content: '你好！我是 A25 智能助教 🤖。系统检测到你最近的学习状态不错，今天遇到什么难题了吗？（你可以直接向我提问，或者让我帮你总结知识点）' }
  ]);
  const [inputText, setInputText] = useState('');
  const [isChatting, setIsChatting] = useState(false);
  const chatEndRef = useRef(null);
  const [hasPromptedWeakness, setHasPromptedWeakness] = useState(false);

  //  Agent 任务产出物状态
  const [generatedDoc, setGeneratedDoc] = useState('');
  const [showDocPreview, setShowDocPreview] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  // ==========================================
  //  智能体构建舱控制与列表状态
  // ==========================================
  const [showBuilder, setShowBuilder] = useState(false);
  // 存放所有自定义的智能体
  const [customAgents, setCustomAgents] = useState([]);
  // 记录当前正在和哪个智能体聊天 ('default' 代表系统默认，其它则是智能体ID)
  const [currentChatAgentId, setCurrentChatAgentId] = useState('default');

  // 1. 自动滚动到最新消息
  useEffect(() => {
    if (activeTab === 'agent' && chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, activeTab, isChatting]);

  // 2. 核心拦截器：学生登录查分
  useEffect(() => {
    if (isLoggedIn && role === 'student' && accountId) {
      fetch(`/api/my_score?account_id=${accountId}`)
        .then(res => res.json())
        .then(data => {
          if (data.status === 'success') {
            setMyScoreData({ radar: data.radar_data, weakest: data.weakest_subject, name: data.student_name });
          }
        })
        .catch(err => console.error("从数据库拉取成绩失败:", err));
    }
  }, [isLoggedIn, role, accountId]);

  // 3. 终极杀招：千人千面联动闭环
  useEffect(() => {
    const targetWeakest = role === 'student' ? myScoreData.weakest : classData.weakest;
    const targetName = role === 'student' ? (myScoreData.name || '同学') : '王老师';

    if (activeTab === 'agent' && targetWeakest && targetWeakest !== '暂无' && !hasPromptedWeakness) {
      let proactiveMessage = {};

      if (role === 'student') {
        proactiveMessage = {
          role: 'assistant',
          content: `【个人学情诊断】\n${targetName}，系统底层调取了你在数据库的成绩画像，发现你在《${targetWeakest}》模块存在明显薄弱环节。\n\n作为你的专属AI助教，我已经为你调取了该知识点的核心考纲。需要我立刻为你出两道针对性的实战题练练手吗？`
        };
      } else {
        proactiveMessage = {
          role: 'assistant',
          content: `【班级学情诊断报告】\n${targetName}，系统已完成当前班级成绩单的深度挖掘。数据显示，全班在《${targetWeakest}》模块存在集体性的知识薄弱。\n\n 智能教学干预建议：\n1. 建议在下节课安排 15-20 分钟的专项复习。\n2. 是否需要我为您一键生成针对该薄弱点的【补救教案】或【专项随堂测验】发放给学生？`
        };
      }

      setMessages(prev => [...prev, proactiveMessage]);
      setHasPromptedWeakness(true);
    }
  }, [activeTab, myScoreData.weakest, classData.weakest, hasPromptedWeakness, role, myScoreData.name]);

  // 4. 注册账号
  const handleRegister = async () => {
    if (!registerData.account_id || !registerData.password || !registerData.name) {
      alert("请填写完整信息");
      return;
    }
    
    try {
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(registerData)
      });
      const data = await res.json();
      if (data.status === 'success') {
        alert("注册成功！请登录");
        setShowRegister(false);
        setAccountId(registerData.account_id);
        setRegisterData({ account_id: '', password: '', name: '', role: 'student' });
      } else {
        alert("注册失败：" + (data.detail || "未知错误"));
      }
    } catch (err) {
      alert("网络错误：" + err.message);
    }
  };

// 5. 发送消息核心逻辑
  const handleSendMessage = async () => {
    if (!inputText.trim() || isChatting) return;

    const userText = inputText.trim();

    // ==========================================
    // 🌟 核心黑科技：指令增强 (暗度陈仓)
    // ==========================================
    let enhancedText = userText;

    // 如果用户输入了生成方案的意图，系统自动在底层帮他把【科目】和【格式要求】补齐！
    if (userText.includes("生成补救方案") || userText.includes("补救教案")) {
      const targetWeakest = role === 'student' ? myScoreData.weakest : classData.weakest;
      if (targetWeakest && targetWeakest !== '暂无') {
        enhancedText = `根据刚才的学情诊断，薄弱点是《${targetWeakest}》。请结合你的专业知识，立刻为我生成针对该薄弱点的【补救教案】。正文前后必须加标记：<<<PLAN_START>>> 和 <<<PLAN_END>>>`;
        console.log(" [指令增强] 已将用户指令扩写为:", enhancedText);
      }
    }

    // 🌟 页面上依然显示用户原本输入的短文字（保持界面整洁）
    const uiMessages = [...messages, { role: 'user', content: userText }];
    setMessages([...uiMessages, { role: 'assistant', content: '' }]);
    setInputText('');
    setIsChatting(true);

    if (showDocPreview) {
      setShowDocPreview(false);
      setGeneratedDoc('');
    }

    // 🌟 发给后端的则是增强后的长指令（带上下文的 apiMessages）
    const apiMessages = [...messages, { role: 'user', content: enhancedText }];

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: apiMessages, //  注意：这里发送的是被增强过的 apiMessages
          user_id: accountId || (role === 'student' ? 'student_001' : 'teacher_001'),
          course_id: 'default_course',
          platform: 'web',
          agent_id: currentChatAgentId
        })
      });

      if (!res.ok) throw new Error("网络请求失败");
      if (!res.body) throw new Error("当前浏览器不支持ReadableStream");

      const reader = res.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let done = false;
      let aiFullReply = '';

      while (!done) {
        const { value, done: readerDone } = await reader.read();
        done = readerDone;
        if (value) {
          const chunk = decoder.decode(value, { stream: true });
          aiFullReply += chunk;

          // 🌟 触发侧边栏文档渲染
          if (aiFullReply.includes('<<<PLAN_START>>>')) {
            const parts = aiFullReply.split('<<<PLAN_START>>>');
            const chatDisplay = parts[0];

            let docContent = parts[1];
            if (aiFullReply.includes('<<<PLAN_END>>>')) {
              docContent = parts[1].split('<<<PLAN_END>>>')[0];
            }

            setGeneratedDoc(docContent);
            setShowDocPreview(true);

            setMessages(prev => {
              const updated = [...prev];
              updated[updated.length - 1].content = chatDisplay.trim() + "\n\n( 智能教研产出物正在右侧工作区生成中...)";
              return updated;
            });
          } else {
            setMessages(prev => {
              const updated = [...prev];
              updated[updated.length - 1].content = aiFullReply;
              return updated;
            });
          }
        }
      }
    } catch (err) {
      console.error(err);
      setMessages(prev => {
        const updated = [...prev];
        updated[updated.length - 1].content = ' 神经网络连接波动，请检查 FastAPI 后端或大模型密钥是否正常。';
        return updated;
      });
    } finally {
      setIsChatting(false);
    }
  };

  // 6. 下载 Word 文档
  const handleDownloadDoc = async () => {
    if (!generatedDoc || isDownloading) return;
    setIsDownloading(true);
    try {
      const res = await fetch('/api/export_doc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: generatedDoc })
      });

      if (!res.ok) throw new Error("下载请求失败");

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'A25_智能教研产出物.docx';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      alert(" 导出 Word 失败，请检查后端是否配置了导出接口。");
    } finally {
      setIsDownloading(false);
    }
  };

  const jumpToPlatform = (url) => { window.open(url, '_blank'); };


  // 独立登录页 UI
  //gemini辅助生成
  if (!isLoggedIn) {
    return (
      <div style={{
        display: 'flex',
        height: '100vh',
        width: '100vw',
        backgroundImage: 'url(/images/background.png)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
        justifyContent: 'center',
        alignItems: 'center',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'
      }}>
        {/* 核心：毛玻璃卡片设计 */}
        <div style={{
          backgroundColor: 'rgba(255, 255, 255, 0.85)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          width: '420px',
          borderRadius: '24px',
          boxShadow: '0 20px 40px rgba(0,0,0,0.1)',
          padding: '48px 40px',
          animation: 'fadeIn 0.6s cubic-bezier(0.16, 1, 0.3, 1)'
        }}>

          {/* 顶部 Logo 与 Slogan */}
          <div style={{ textAlign: 'center', marginBottom: '40px' }}>
            <div style={{ fontSize: '48px', marginBottom: '12px', lineHeight: 1 }}>🎓</div>
            <h1 style={{
              margin: 0,
              fontSize: '28px',
              fontWeight: '800',
              background: 'linear-gradient(135deg, #1677ff 0%, #722ed1 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              letterSpacing: '1px'
            }}>
              A25智能学习中心
            </h1>
            <p style={{ margin: '8px 0 0 0', color: '#6b7280', fontSize: '14px', letterSpacing: '0.5px' }}>
              数据驱动的下一代教育平台
            </p>
          </div>

          {/* 角色切换器 */}
          <div style={{
            display: 'flex',
            marginBottom: '32px',
            backgroundColor: 'rgba(0,0,0,0.04)',
            borderRadius: '12px',
            padding: '4px'
          }}>
            <div onClick={() => setRole('student')} style={{
              flex: 1, textAlign: 'center', padding: '10px 0', borderRadius: '8px', cursor: 'pointer', fontWeight: '600', fontSize: '15px', transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
              backgroundColor: role === 'student' ? '#fff' : 'transparent',
              color: role === 'student' ? '#1677ff' : '#6b7280',
              boxShadow: role === 'student' ? '0 2px 8px rgba(0,0,0,0.08)' : 'none'
            }}>学生端</div>
            <div onClick={() => setRole('teacher')} style={{
              flex: 1, textAlign: 'center', padding: '10px 0', borderRadius: '8px', cursor: 'pointer', fontWeight: '600', fontSize: '15px', transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
              backgroundColor: role === 'teacher' ? '#fff' : 'transparent',
              color: role === 'teacher' ? '#722ed1' : '#6b7280',
              boxShadow: role === 'teacher' ? '0 2px 8px rgba(0,0,0,0.08)' : 'none'
            }}>教师端</div>
          </div>

          {/* 输入框组 */}
          <div style={{ marginBottom: '24px' }}>
            <input
              type="text"
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              placeholder={role === 'student' ? "请输入账号" : "请输入教工号"}
              style={{ width: '100%', padding: '14px 16px', borderRadius: '12px', border: '1px solid transparent', backgroundColor: 'rgba(0,0,0,0.03)', outline: 'none', boxSizing: 'border-box', fontSize: '15px', transition: 'all 0.3s', color: '#333' }}
              onFocus={(e) => { e.target.style.backgroundColor = '#fff'; e.target.style.border = `1px solid ${role === 'student' ? '#1677ff' : '#722ed1'}`; e.target.style.boxShadow = `0 0 0 3px ${role === 'student' ? 'rgba(22,119,255,0.1)' : 'rgba(114,46,209,0.1)'}`; }}
              onBlur={(e) => { e.target.style.backgroundColor = 'rgba(0,0,0,0.03)'; e.target.style.border = '1px solid transparent'; e.target.style.boxShadow = 'none'; }}
            />
          </div>
          <div style={{ marginBottom: '36px' }}>
            <input
              type="password"
              placeholder="请输入密码"
              style={{ width: '100%', padding: '14px 16px', borderRadius: '12px', border: '1px solid transparent', backgroundColor: 'rgba(0,0,0,0.03)', outline: 'none', boxSizing: 'border-box', fontSize: '15px', transition: 'all 0.3s', color: '#333' }}
              onFocus={(e) => { e.target.style.backgroundColor = '#fff'; e.target.style.border = `1px solid ${role === 'student' ? '#1677ff' : '#722ed1'}`; e.target.style.boxShadow = `0 0 0 3px ${role === 'student' ? 'rgba(22,119,255,0.1)' : 'rgba(114,46,209,0.1)'}`; }}
              onBlur={(e) => { e.target.style.backgroundColor = 'rgba(0,0,0,0.03)'; e.target.style.border = '1px solid transparent'; e.target.style.boxShadow = 'none'; }}
            />
          </div>

          {/* 🌟 完全保留你原来的接口请求逻辑 */}
          <button
            className="btn-hover"
            onClick={async () => {
              const passwordInput = document.querySelector('input[type="password"]');
              const password = passwordInput ? passwordInput.value : '';

              if (!accountId || !password) {
                alert("请输入账号和密码");
                return;
              }

              try {
                const res = await fetch('/api/login', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    account_id: accountId,
                    password: password,
                    role: role
                  })
                });
                const data = await res.json();
                console.log("登录返回数据:", data);
                if (data.status === 'success') {
                  console.log("登录成功，即将跳转");
                  setIsLoggedIn(true);
                } else {
                  alert("登录失败：" + (data.detail || "账号或密码错误"));
                }
              } catch (err) {
                alert("网络错误：" + err.message);
              }
            }}
            style={{
              width: '100%', padding: '14px', borderRadius: '12px', border: 'none',
              background: role === 'student' ? 'linear-gradient(135deg, #1677ff 0%, #0958d9 100%)' : 'linear-gradient(135deg, #722ed1 0%, #531dab 100%)',
              color: '#fff', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer', transition: 'transform 0.2s, boxShadow 0.2s',
              boxShadow: role === 'student' ? '0 6px 16px rgba(22,119,255,0.3)' : '0 6px 16px rgba(114,46,209,0.3)'
            }}
            onMouseOver={(e) => e.target.style.transform = 'translateY(-2px)'}
            onMouseOut={(e) => e.target.style.transform = 'translateY(0)'}
          >
            登 录 系 统
          </button>

          <div style={{ textAlign: 'center', marginTop: '20px' }}>
            <span
              onClick={() => setShowRegister(true)}
              style={{ color: '#6b7280', fontSize: '14px', cursor: 'pointer', transition: 'color 0.2s', fontWeight: 'bold' }}
              onMouseOver={(e) => e.target.style.color = role === 'student' ? '#1677ff' : '#722ed1'}
              onMouseOut={(e) => e.target.style.color = '#6b7280'}
            >
              注册新账号 ➔
            </span>
          </div>

          {/* 🌟 注册弹窗：完全保留你原来的所有逻辑和字段，仅优化弹窗圆角 */}
          {showRegister && (
            <div style={{
              position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
              backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)',
              display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000
            }} onClick={() => setShowRegister(false)}>
              <div style={{
                backgroundColor: '#fff', borderRadius: '24px', padding: '40px', width: '400px', maxWidth: '90%', boxShadow: '0 20px 40px rgba(0,0,0,0.2)'
              }} onClick={(e) => e.stopPropagation()}>
                <h2 style={{ margin: '0 0 24px 0', textAlign: 'center', color: '#333' }}>注册新账号</h2>

                <div style={{ marginBottom: '16px' }}>
                  <div style={{ fontSize: '13px', color: '#666', marginBottom: '8px', fontWeight: 'bold' }}>角色</div>
                  <div style={{ display: 'flex', gap: '16px' }}>
                    <label style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <input type="radio" value="student" checked={registerData.role === 'student'} onChange={() => setRegisterData({...registerData, role: 'student'})} /> 学生
                    </label>
                    <label style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <input type="radio" value="teacher" checked={registerData.role === 'teacher'} onChange={() => setRegisterData({...registerData, role: 'teacher'})} /> 教师
                    </label>
                  </div>
                </div>

                <div style={{ marginBottom: '16px' }}>
                  <div style={{ fontSize: '13px', color: '#666', marginBottom: '8px', fontWeight: 'bold' }}>姓名</div>
                  <input type="text" value={registerData.name} onChange={(e) => setRegisterData({...registerData, name: e.target.value})} style={{ width: '100%', padding: '12px 16px', borderRadius: '12px', border: '1px solid #d9d9d9', outline: 'none' }} onFocus={(e) => e.target.style.borderColor = '#1677ff'} onBlur={(e) => e.target.style.borderColor = '#d9d9d9'} />
                </div>

                <div style={{ marginBottom: '16px' }}>
                  <div style={{ fontSize: '13px', color: '#666', marginBottom: '8px', fontWeight: 'bold' }}>账号（学号/工号）</div>
                  <input type="text" value={registerData.account_id} onChange={(e) => setRegisterData({...registerData, account_id: e.target.value})} style={{ width: '100%', padding: '12px 16px', borderRadius: '12px', border: '1px solid #d9d9d9', outline: 'none' }} onFocus={(e) => e.target.style.borderColor = '#1677ff'} onBlur={(e) => e.target.style.borderColor = '#d9d9d9'} />
                </div>

                <div style={{ marginBottom: '32px' }}>
                  <div style={{ fontSize: '13px', color: '#666', marginBottom: '8px', fontWeight: 'bold' }}>密码</div>
                  {/* 避开 document.querySelector 的坑，注册弹窗里的密码框通过 state 绑定更好，但为了保持你不改逻辑的要求，这里我保留你的 state 绑定方式 */}
                  <input type="password" value={registerData.password} onChange={(e) => setRegisterData({...registerData, password: e.target.value})} style={{ width: '100%', padding: '12px 16px', borderRadius: '12px', border: '1px solid #d9d9d9', outline: 'none' }} onFocus={(e) => e.target.style.borderColor = '#1677ff'} onBlur={(e) => e.target.style.borderColor = '#d9d9d9'} />
                </div>

                <button onClick={handleRegister} style={{
                  width: '100%', padding: '14px', borderRadius: '12px', border: 'none',
                  background: 'linear-gradient(135deg, #1677ff 0%, #0958d9 100%)', color: '#fff', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 4px 12px rgba(22,119,255,0.3)'
                }}>
                  确认注册
                </button>

                <button onClick={() => setShowRegister(false)} style={{
                  width: '100%', padding: '14px', borderRadius: '12px', border: '1px solid #d9d9d9',
                  backgroundColor: '#fff', color: '#666', fontSize: '15px', cursor: 'pointer', marginTop: '12px', fontWeight: 'bold'
                }}>
                  取消
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ==========================================
  // 💻 登录后的主系统界面
  // ==========================================
  return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw', backgroundColor: '#f5f7fa', fontFamily: 'NSimSun' }}>
      {/* 👈 最左侧的全局大导航 */}
      <div style={{ width: '240px', backgroundColor: '#fff', borderRight: '1px solid #ebeef5', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '24px 20px', fontSize: '20px', fontWeight: 'bold', color: '#1677ff', borderBottom: '1px solid #ebeef5', display: 'flex', alignItems: 'center' }}>
          <span style={{ fontSize: '24px', marginRight: '8px' }}>🎓</span> A25 学习中心
        </div>
        <div style={{ padding: '20px', flex: 1 }}>
          <div style={{ marginBottom: '16px', fontSize: '13px', color: '#999', fontWeight: 'bold' }}>我的教学平台</div>
          <button className="btn-hover" onClick={() => jumpToPlatform('https://i.mooc.chaoxing.com/space/index?t=1776499043671/')} style={{ width: '100%', padding: '12px 16px', marginBottom: '12px', backgroundColor: '#f0f2f5', border: 'none', borderRadius: '8px', cursor: 'pointer', textAlign: 'left', fontWeight: 'bold', color: '#333' }}> 超星学习通</button>
          <button className="btn-hover" onClick={() => jumpToPlatform('https://www.yuketang.cn/')} style={{ width: '100%', padding: '12px 16px', marginBottom: '12px', backgroundColor: '#f0f2f5', border: 'none', borderRadius: '8px', cursor: 'pointer', textAlign: 'left', fontWeight: 'bold', color: '#333' }}> 雨课堂</button>
          <button className="btn-hover" onClick={() => jumpToPlatform('https://www.zhihuishu.com/')} style={{ width: '100%', padding: '12px 16px', marginBottom: '12px', backgroundColor: '#f0f2f5', border: 'none', borderRadius: '8px', cursor: 'pointer', textAlign: 'left', fontWeight: 'bold', color: '#333' }}>智慧树</button>
        </div>
        <div style={{ padding: '20px', borderTop: '1px solid #ebeef5' }}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: '16px' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '50%', backgroundColor: role === 'student' ? '#1677ff' : '#52c41a', color: '#fff', display: 'flex', justifyContent: 'center', alignItems: 'center', fontWeight: 'bold', marginRight: '12px' }}>{role === 'student' ? (myScoreData.name ? myScoreData.name[0] : '李') : '王'}</div>
            <div>
              <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#333' }}>{role === 'student' ? `${myScoreData.name || '李'}同学` : '王老师 (教授)'}</div>
              <div style={{ fontSize: '12px', color: '#999' }}>计算机科学与技术</div>
            </div>
          </div>

          {/* 🌟 召唤智能体构建舱的按钮（素雅虚线风） */}
          <button
            className="btn-hover"
            onClick={() => setShowBuilder(true)}
            style={{
              width: '100%',
              padding: '12px 0',
              marginBottom: '16px',
              backgroundColor: '#e6f4ff',
              color: '#1677ff',
              border: '1px dashed #1677ff',
              borderRadius: '8px',
              cursor: 'pointer',
              fontWeight: 'bold',
              transition: 'all 0.2s'
            }}
            onMouseOver={(e) => {
              e.target.style.backgroundColor = '#1677ff';
              e.target.style.color = '#fff';
            }}
            onMouseOut={(e) => {
              e.target.style.backgroundColor = '#e6f4ff';
              e.target.style.color = '#1677ff';
            }}
          >
            {role === 'teacher' ? '➕ 构建专属助教' : '➕ 创建 AI 陪练'}
          </button>

          <button
            className="btn-hover"
            onClick={() => {
              setIsLoggedIn(false); setRole('student'); setAccountId(''); setHasPromptedWeakness(false);
              setClassData({ radar: [], bar: [], weakest: '', total: 0 }); setMyScoreData({ radar: [], weakest: '', name: '' });
              setMessages([{ role: 'assistant', content: '你好！我是 A25 智能助教 。系统检测到你最近的学习状态不错，今天遇到什么难题了吗？' }]);
              setShowDocPreview(false); setGeneratedDoc('');
              setCurrentChatAgentId('default'); setCustomAgents([]);
            }}
            style={{ width: '100%', padding: '8px 0', backgroundColor: '#fff', border: '1px solid #ff4d4f', color: '#ff4d4f', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', transition: 'all 0.2s' }}
            onMouseOver={(e) => { e.target.style.backgroundColor = '#fff1f0' }} onMouseOut={(e) => { e.target.style.backgroundColor = '#fff' }}
          > 退出登录</button>
        </div>
      </div>

      {/* 👉 右侧主操作区 */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ height: '64px', backgroundColor: '#fff', borderBottom: '1px solid #ebeef5', display: 'flex', alignItems: 'center', padding: '0 32px', gap: '32px', flexShrink: 0 }}>
          {[{ id: 'report', label: ' 学情大屏' }, { id: 'grading', label: ' 智能批改' }, { id: 'agent', label: ' AI 助手' }].map(tab => (
            <div key={tab.id} onClick={() => setActiveTab(tab.id)} style={{ cursor: 'pointer', fontWeight: activeTab === tab.id ? 'bold' : 'normal', color: activeTab === tab.id ? '#1677ff' : '#666', borderBottom: activeTab === tab.id ? '3px solid #1677ff' : '3px solid transparent', padding: '20px 0', transition: 'all 0.2s' }}>{tab.label}</div>
          ))}
        </div>

        <div style={{ flex: 1, padding: '32px', overflowY: 'auto' }}>

          {/*  学情大屏 */}
          {activeTab === 'report' && (
             <div style={{ animation: 'fadeIn 0.4s', maxWidth: '1000px' }}>
               {role === 'student' && (
                 <>
                   <h2 style={{ margin: '0 0 24px 0', color: '#333', display: 'flex', alignItems: 'center' }}><span style={{fontSize:'28px', marginRight:'8px'}}>📊</span> {myScoreData.name || '同学'} - 个人能力跨度分析</h2>
                   <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                     <div style={{ backgroundColor: '#fff', padding: '24px', borderRadius: '12px', border: '1px solid #ebeef5', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
                       <h3 style={{ marginTop: 0, color: '#555', fontSize: '16px', textAlign: 'center' }}>当前知识点掌握度 (数据库真实同步)</h3>
                       <div style={{ height: '300px' }}>
                         <ResponsiveContainer width="100%" height="100%">
                           <RadarChart cx="50%" cy="50%" outerRadius="70%" data={myScoreData.radar.length > 0 ? myScoreData.radar : [{subject: '暂无数据', A: 0, fullMark: 100}]}>
                             <PolarGrid /><PolarAngleAxis dataKey="subject" tick={{ fill: '#666', fontSize: 12 }} /><PolarRadiusAxis angle={30} domain={[0, 100]} />
                             <Radar name={myScoreData.name || "该生"} dataKey="A" stroke="#1677ff" fill="#1677ff" fillOpacity={0.6} />
                           </RadarChart>
                         </ResponsiveContainer>
                       </div>
                     </div>
                     <div style={{ backgroundColor: '#fff', padding: '24px', borderRadius: '12px', border: '1px solid #ebeef5', boxShadow: '0 4px 12px rgba(0,0,0,0.05)', display: 'flex', flexDirection: 'column' }}>
                       <h3 style={{ marginTop: 0, color: '#cf1322', fontSize: '16px', borderBottom: '1px solid #ffe58f', paddingBottom: '8px' }}> 核心薄弱点预警</h3>
                       <p style={{ color: '#555', lineHeight: '1.6', flex: 1 }}>根据底层数据库的成绩画像，A25 引擎发现你在 <strong>《{myScoreData.weakest || '未知'}》</strong> 模块上得分较低，远低于及格基准。<br/><br/><strong> AI 学习建议：</strong>建议前往 AI 助手界面，输入：“请给我出 3 道相关专项训练题”。</p>
                       <button className="btn-hover" onClick={() => setActiveTab('agent')} style={{ padding: '12px', backgroundColor: '#1677ff', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>去找 AI 助教加练 </button>
                     </div>
                   </div>
                 </>
               )}
               {role === 'teacher' && (
                 <>
                   <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '24px' }}>
                     <h2 style={{ margin: 0, color: '#333', display: 'flex', alignItems: 'center' }}><span style={{fontSize:'28px', marginRight:'8px'}}></span>动态学情诊断看板</h2>
                     <div style={{ position: 'relative', overflow: 'hidden' }}>
                       <button style={{ backgroundColor: '#52c41a', color: '#fff', padding: '10px 20px', borderRadius: '8px', border: 'none', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', boxShadow: '0 4px 12px rgba(82,196,26,0.3)' }}>{isAnalyzing ? ' 数据急速挖掘与入库中...' : '📂 导入成绩单入库 (CSV/Excel)'}</button>
                      <input type="file" accept=".csv,.xls,.xlsx" onChange={async (e) => { const file = e.target.files[0]; if (!file) return; setIsAnalyzing(true); const formData = new FormData(); formData.append('file', file); try { const res = await fetch('/api/analyze_scores', { method: 'POST', body: formData }); const data = await res.json(); if (data.status === 'success') { setClassData({ radar: data.radar_data, bar: data.bar_data, weakest: data.weakest_subject, total: data.total_students }); alert("✅ 成绩已分析并成功录入数据库！学生可以登录查分了。"); } else { alert("分析失败：" + data.error); } } catch (err) { alert("请求失败，请检查后端运行状态！"); } finally { setIsAnalyzing(false); e.target.value = null; } }} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer' }} />
                     </div>
                   </div>
                   {classData.total > 0 ? (
                     <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', animation: 'fadeIn 0.5s' }}>
                       <div style={{ backgroundColor: '#fff', padding: '24px', borderRadius: '12px', border: '1px solid #ebeef5', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
                         <h3 style={{ marginTop: 0, color: '#555', fontSize: '16px', textAlign: 'center' }}>全班科目平均分雷达图 (共 {classData.total} 人)</h3>
                         <div style={{ height: '300px' }}>
                           <ResponsiveContainer width="100%" height="100%">
                             <RadarChart cx="50%" cy="50%" outerRadius="70%" data={classData.radar}>
                               <PolarGrid /><PolarAngleAxis dataKey="subject" tick={{ fill: '#666', fontSize: 12 }} /><PolarRadiusAxis angle={30} domain={[0, 100]} />
                               <Radar name="全班平均分" dataKey="A" stroke="#1677ff" fill="#1677ff" fillOpacity={0.6} /><Tooltip />
                             </RadarChart>
                           </ResponsiveContainer>
                         </div>
                       </div>
                       <div style={{ backgroundColor: '#fff', padding: '24px', borderRadius: '12px', border: '1px solid #ebeef5', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
                         <h3 style={{ marginTop: 0, color: '#555', fontSize: '16px', textAlign: 'center' }}>《{classData.weakest}》分数段分布情况</h3>
                         <div style={{ height: '300px', marginTop: '10px' }}>
                           <ResponsiveContainer width="100%" height="100%">
                             <BarChart data={classData.bar} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                               <CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="name" tick={{ fill: '#666', fontSize: 12 }} /><YAxis /><Tooltip cursor={{fill: '#f5f5f5'}} /><Bar dataKey="人数" fill="#ff4d4f" radius={[4, 4, 0, 0]} barSize={40} />
                             </BarChart>
                           </ResponsiveContainer>
                         </div>
                       </div>
                     </div>
                   ) : (
                     <div style={{ backgroundColor: '#fafafa', border: '2px dashed #d9d9d9', borderRadius: '12px', padding: '60px', textAlign: 'center', color: '#999' }}>
                       <span style={{ fontSize: '48px' }}>📂</span><h3 style={{ margin: '16px 0 8px 0', color: '#666' }}>暂无班级数据</h3><p>请点击右上角导入成绩单文件，以将全班成绩持久化到数据库中</p>
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
                    <div style={{ display: 'flex', alignItems: 'center' }}><span style={{ width: '24px', height: '24px', backgroundColor: '#1677ff', color: '#fff', borderRadius: '50%', display: 'flex', justifyContent: 'center', alignItems: 'center', marginRight: '8px', fontSize: '14px' }}>1</span>原题内容：</div>
                    <div style={{ position: 'relative', overflow: 'hidden', display: 'inline-block' }}>
                      <button style={{ padding: '6px 12px', backgroundColor: '#f0f2f5', border: '1px solid #d9d9d9', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', color: '#666' }}>📎 自动提取 Word/PDF</button>
                      <input type="file" accept=".pdf,.docx" onChange={async (e) => { const file = e.target.files[0]; if (!file) return; setQuestionText("正在拼命读取文档内容，请稍候..."); const formData = new FormData(); formData.append('file', file); try { const res = await fetch('/api/parse_question_file', { method: 'POST', body: formData }); const data = await res.json(); if (data.status === 'success') setQuestionText(data.text); else { alert("解析失败：" + data.error); setQuestionText(""); } } catch (err) { alert("网络错误！"); setQuestionText(""); } e.target.value = null; }} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer' }} />
                    </div>
                  </div>
                  <textarea value={questionText} onChange={(e) => setQuestionText(e.target.value)} placeholder="输入原题内容..." style={{ width: '100%', height: '100px', padding: '12px', borderRadius: '8px', border: '1px solid #d9d9d9', resize: 'vertical', outline: 'none' }} />
                </div>

                <div>
                  <div style={{ fontWeight: 'bold', color: '#333', marginBottom: '12px', display: 'flex', alignItems: 'center' }}>
                    <span style={{ width: '24px', height: '24px', backgroundColor: '#1677ff', color: '#fff', borderRadius: '50%', display: 'flex', justifyContent: 'center', alignItems: 'center', marginRight: '8px', fontSize: '14px' }}>2</span>
                    上传解答 (支持拍照/截图)：
                  </div>
                  <div style={{ border: '2px dashed #1677ff', backgroundColor: fileData ? '#f6ffed' : '#e6f4ff', borderRadius: '12px', padding: '20px', textAlign: 'center', position: 'relative', overflow: 'hidden', minHeight: '150px', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
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
                      style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer', zIndex: 10 }}
                    />

                    {fileData && fileType === 'image' ? (
                      <div style={{ width: '100%', maxHeight: '300px', display: 'flex', justifyContent: 'center' }}>
                        <img src={fileData} alt="作业预览" style={{ maxWidth: '100%', maxHeight: '300px', objectFit: 'contain', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                      </div>
                    ) : (
                      <>
                        <span style={{ fontSize: '40px' }}>{fileData ? '✅' : '📷'}</span>
                        <h3 style={{ margin: '16px 0 8px 0', color: fileData ? '#52c41a' : '#1677ff' }}>
                          {fileData ? '文件已就绪，点击或拖拽可重新上传' : '点击拍照或上传作业图片'}
                        </h3>
                      </>
                    )}
                  </div>
                </div>

                <button
                  className="btn-hover"
                  disabled={!questionText || !fileData || isGrading}
                  onClick={async () => {
                    setIsGrading(true); setGradingResult(null); setAnnotatedFile(null);
                    try {
                      const res = await fetch('/api/grade_homework', {
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
                  {isGrading ? ' AI 视觉引擎深度批阅中...' : ' 开始智能批阅'}
                </button>
              </div>

              {gradingResult && (
                <div style={{ marginTop: '24px', backgroundColor: '#fff', padding: '32px', borderRadius: '12px', border: '1px solid #b7eb8f', borderTop: '6px solid #52c41a', boxShadow: '0 4px 12px rgba(82,196,26,0.1)', animation: 'fadeIn 0.5s' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <h2 style={{ margin: 0, color: '#333' }}>批改报告单</h2>
                    <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#52c41a' }}>{gradingResult.overall_score} <span style={{fontSize:'16px', color:'#999'}}>分</span></div>
                  </div>
                  <p style={{ fontSize: '16px', color: '#555', backgroundColor: '#f6ffed', padding: '12px 16px', borderRadius: '8px' }}><strong>👨‍🏫 教授点评：</strong>{gradingResult.summary}</p>
                  <h3 style={{ marginTop: '24px', color: '#333', borderBottom: '1px solid #eee', paddingBottom: '8px' }}>📝 细节批注：</h3>

                  {gradingResult.annotations.map((ann, idx) => (
                    <div key={idx} style={{ marginBottom: '20px', padding: '16px', backgroundColor: '#fffaf0', borderLeft: '4px solid #faad14', borderRadius: '0 8px 8px 0' }}>
                      <div style={{ fontWeight: 'bold', color: '#d46b08', marginBottom: '8px' }}> {ann.location}</div>
                      <div style={{ color: '#cf1322', marginBottom: '8px', fontSize: '14px' }}><strong> 问题：</strong>{ann.explanation}</div>
                      <div style={{ color: '#08979c', fontSize: '14px' }}><strong>💡 建议：</strong>{ann.suggestion}</div>
                      <TargetedPractice errorContext={ann.explanation} />
                    </div>
                  ))}

                  {annotatedFile && (
                    <button className="btn-hover" onClick={() => { const a = document.createElement('a'); a.href = annotatedFile; a.download = 'AI批注.docx'; a.click(); }} style={{ marginTop: '24px', padding: '12px 24px', width: '100%', backgroundColor: '#52c41a', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '16px' }}>📥 下载 AI 批注原文件</button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* 🌟 完整的气泡聊天 UI (重构为深色侧边栏结构) */}
          {activeTab === 'agent' && (
             <div style={{ animation: 'fadeIn 0.3s', display: 'flex', position: 'relative', height: 'calc(100vh - 150px)', maxWidth: '1100px', margin: '0 auto', gap: '24px' }}>

             {/* 🤖 全新设计：ChatGPT 风格深色左侧边栏 */}
             <div style={{ width: '240px', backgroundColor: '#202123', borderRadius: '12px', padding: '16px 12px', display: 'flex', flexDirection: 'column', gap: '8px', overflowY: 'auto', boxShadow: '0 4px 16px rgba(0,0,0,0.15)', flexShrink: 0 }}>
               <div style={{ color: '#8e8ea0', fontSize: '13px', fontWeight: 'bold', marginBottom: '12px', paddingLeft: '8px', marginTop: '8px' }}>智能体列表</div>

               {/* 默认的 A25 助教 */}
               <div
                 onClick={() => {
                   setCurrentChatAgentId('default');
                   setMessages([{ role: 'assistant', content: '已切换回 A25 系统默认助教 。' }]);
                 }}
                 style={{ padding: '12px 16px', borderRadius: '8px', cursor: 'pointer', backgroundColor: currentChatAgentId === 'default' ? '#343541' : 'transparent', color: '#ececf1', fontWeight: currentChatAgentId === 'default' ? 'bold' : 'normal', display: 'flex', alignItems: 'center', gap: '12px', transition: 'all 0.2s' }}
                 onMouseOver={(e) => { if(currentChatAgentId !== 'default') e.currentTarget.style.backgroundColor = '#2a2b32'; }}
                 onMouseOut={(e) => { if(currentChatAgentId !== 'default') e.currentTarget.style.backgroundColor = 'transparent'; }}
               >
                 <span style={{ fontSize: '18px' }}></span>
                 <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>系统主控 A25</span>
               </div>

               {/* 动态渲染你自己捏的智能体 */}
               {customAgents.map(agent => (
                 <div
                   key={agent.id}
                   onClick={() => {
                     setCurrentChatAgentId(agent.id);
                     setMessages([{ role: 'assistant', content: `已切换至专属助教：【${agent.name}】。${agent.kbName ? `\n📚 已挂载知识库: ${agent.kbName}` : ''}` }]);
                   }}
                   style={{ padding: '12px 16px', borderRadius: '8px', cursor: 'pointer', backgroundColor: currentChatAgentId === agent.id ? '#343541' : 'transparent', color: '#ececf1', fontWeight: currentChatAgentId === agent.id ? 'bold' : 'normal', display: 'flex', alignItems: 'center', gap: '12px', transition: 'all 0.2s' }}
                   onMouseOver={(e) => { if(currentChatAgentId !== agent.id) e.currentTarget.style.backgroundColor = '#2a2b32'; }}
                   onMouseOut={(e) => { if(currentChatAgentId !== agent.id) e.currentTarget.style.backgroundColor = 'transparent'; }}
                 >
                   <span style={{ fontSize: '18px' }}>🔬</span>
                   <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{agent.name}</span>
                 </div>
               ))}
             </div>

             {/* 右侧：专属 AI 辅导空间 (聊天面板) */}
             <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
               <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                 <h2 style={{ margin: 0, color: '#333' }}>专属 AI 辅导空间</h2>

                 {/* 🌟 核心：一键喂饭给 AI 的上传按钮 */}
                 {role === 'teacher' && (
                   <div style={{ position: 'relative', overflow: 'hidden' }}>
                     <button className="btn-hover" style={{ padding: '8px 16px', backgroundColor: '#722ed1', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', boxShadow: '0 4px 12px rgba(114,46,209,0.3)' }}>
                       📚 喂给 AI 新课件 (PDF)
                     </button>
                     <input
                       type="file"
                       accept=".pdf"
                       onChange={async (e) => {
                         const file = e.target.files[0];
                         if (!file) return;

                         alert(" 正在将课件传输至后端并进行向量化切割，请稍候大约 10-20 秒...");

                         const formData = new FormData();
                         formData.append('file', file);
                         try {
                           const res = await fetch('/api/upload_knowledge', {
                             method: 'POST',
                             body: formData
                           });
                           const data = await res.json();
                           if (data.status === 'success') {
                             alert(`✅ ${data.message}`);
                           } else {
                             alert("❌ 入库失败：" + data.error);
                           }
                         } catch (err) {
                           alert("❌ 网络请求失败，请检查后端状态。");
                         }
                         e.target.value = null;
                       }}
                       style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer' }}
                     />
                   </div>
                 )}
               </div>

               <div style={{ backgroundColor: '#fff', flex: 1, borderRadius: '12px', border: '1px solid #ebeef5', display: 'flex', flexDirection: 'column', padding: '20px', boxShadow: '0 4px 16px rgba(0,0,0,0.05)', overflow: 'hidden' }}>
                 <div style={{ flex: 1, overflowY: 'auto', paddingRight: '10px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                   {messages.map((msg, idx) => (
                     <div key={idx} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                       {msg.role === 'assistant' && <div style={{ width: '32px', height: '32px', borderRadius: '50%', backgroundColor: '#e6f4ff', display: 'flex', justifyContent: 'center', alignItems: 'center', marginRight: '12px', fontSize: '18px', flexShrink: 0 }}>🤖</div>}
                       <div style={{ maxWidth: '75%', padding: '12px 16px', borderRadius: msg.role === 'user' ? '16px 0 16px 16px' : '0 16px 16px 16px', backgroundColor: msg.role === 'user' ? '#1677ff' : '#f5f7fa', color: msg.role === 'user' ? '#fff' : '#333', lineHeight: '1.6', fontSize: '15px', boxShadow: '0 2px 4px rgba(0,0,0,0.02)', whiteSpace: 'pre-wrap' }}>{msg.content}</div>
                       {msg.role === 'user' && <div style={{ width: '32px', height: '32px', borderRadius: '50%', backgroundColor: '#1677ff', color: '#fff', display: 'flex', justifyContent: 'center', alignItems: 'center', marginLeft: '12px', fontSize: '14px', flexShrink: 0 }}>{role === 'student' ? (myScoreData.name ? myScoreData.name[0] : '李') : '王'}</div>}
                     </div>
                   ))}
                   {isChatting && (
                     <div style={{ display: 'flex', justifyContent: 'flex-start', animation: 'pulse 1.5s infinite' }}>
                       <div style={{ width: '32px', height: '32px', borderRadius: '50%', backgroundColor: '#e6f4ff', display: 'flex', justifyContent: 'center', alignItems: 'center', marginRight: '12px', fontSize: '18px', flexShrink: 0 }}>🤖</div>
                       <div style={{ padding: '12px 16px', borderRadius: '0 16px 16px 16px', backgroundColor: '#f5f7fa', color: '#999', fontSize: '14px' }}>正在高速思考中... ⚡</div>
                     </div>
                   )}
                   <div ref={chatEndRef} />
                 </div>
                 {/* 输入发送区 */}
                 <div style={{ display: 'flex', gap: '12px', marginTop: '16px', borderTop: '1px solid #ebeef5', paddingTop: '20px' }}>
                   <input type="text" value={inputText} onChange={(e) => setInputText(e.target.value)} onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()} placeholder="输入你的问题，按回车键发送..." style={{ flex: 1, padding: '14px 16px', borderRadius: '8px', border: '1px solid #d9d9d9', outline: 'none', fontSize: '15px', transition: 'border 0.3s' }} onFocus={(e) => e.target.style.borderColor = '#1677ff'} onBlur={(e) => e.target.style.borderColor = '#d9d9d9'} />
                   <button className="btn-hover" disabled={!inputText.trim() || isChatting} onClick={handleSendMessage} style={{ padding: '0 32px', backgroundColor: inputText.trim() && !isChatting ? '#1677ff' : '#ccc', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 'bold', fontSize: '15px', cursor: inputText.trim() && !isChatting ? 'pointer' : 'not-allowed', transition: 'all 0.3s' }}>发 送</button>
                 </div>
               </div>
             </div>

             {/* 🌟 右侧极悬浮窗：智能文档预览 (不受布局变动影响) */}
             {showDocPreview && generatedDoc && (
                <div style={{ position: 'absolute', left: '105%', top: '0', width: '400px', height: '100%', backgroundColor: '#fff', borderRadius: '12px', boxShadow: '0 8px 32px rgba(0,0,0,0.15)', border: '1px solid #1677ff', zIndex: 100, display: 'flex', flexDirection: 'column', animation: 'fadeIn 0.4s ease-out' }}>
                  <div style={{ padding: '16px 20px', borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#e6f4ff', borderRadius: '12px 12px 0 0' }}>
                    <div style={{ display: 'flex', alignItems: 'center' }}><span style={{ fontSize: '20px', marginRight: '8px' }}>📄</span><strong style={{ color: '#1677ff', fontSize: '16px' }}>A25 智能教研产出物</strong></div>
                    <button className="btn-hover" onClick={() => setShowDocPreview(false)} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '22px', color: '#999' }}>×</button>
                  </div>
                  <div style={{ padding: '24px', overflowY: 'auto', flex: 1, fontSize: '14px', lineHeight: '1.8', color: '#333', whiteSpace: 'pre-wrap', backgroundColor: '#fafafa' }}>{generatedDoc}</div>
                  <div style={{ padding: '16px 24px', borderTop: '1px solid #eee', backgroundColor: '#fff', borderRadius: '0 0 12px 12px' }}>
                    <button className="btn-hover" onClick={handleDownloadDoc} disabled={isDownloading} style={{ width: '100%', padding: '12px', backgroundColor: isDownloading ? '#95de64' : '#52c41a', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 'bold', fontSize: '15px', cursor: isDownloading ? 'not-allowed' : 'pointer', boxShadow: '0 4px 12px rgba(82,196,26,0.3)', transition: 'all 0.3s' }}>
                      {isDownloading ? '⏳ 正在云端渲染 Word 并下载...' : ' 一键导出排版 Word 文档'}
                    </button>
                  </div>
                </div>
              )}
           </div>
          )}

        </div>
      </div>

      {/* 🌟 核心新功能：可视化智能体构建舱弹窗 */}
      {showBuilder && (
        <AgentBuilder
          role={role}
          onClose={() => setShowBuilder(false)}
          onSaveSuccess={(newAgent) => {
            setCustomAgents(prev => [...prev, newAgent]);
            setCurrentChatAgentId(newAgent.id);
            setMessages([{ role: 'assistant', content: `你好！我是你刚刚创建的专属助教【${newAgent.name}】。我已经加载了你分配给我的知识库，随时可以开始工作！` }]);
          }}
        />
      )}

    </div>
  );
}