import React, { useState } from 'react';
// 👇 引入 recharts 的所有图表核武器
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';

export default function UserPortal() {
  const [activeTab, setActiveTab] = useState('report'); // 默认选中学情报告

  // 👇 新增状态：控制视图身份与图表动态数据
  const [role, setRole] = useState('teacher'); // 'student' 或 'teacher'
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [classData, setClassData] = useState({
    radar: [], bar: [], weakest: '', total: 0
  });

  // 👇 用于作业批改的几个核心状态
  const [questionText, setQuestionText] = useState(''); // 存原题
  const [fileData, setFileData] = useState(null);       // 存文件内容 (Base64 或 纯文本)
  const [fileType, setFileType] = useState('');         // 存文件类型 ('image', 'text', 'docx')
  const [isGrading, setIsGrading] = useState(false);    // 批改中加载状态
  const [gradingResult, setGradingResult] = useState(null); // 存 AI 返回的结果
  const [annotatedFile, setAnnotatedFile] = useState(null); // 🌟 新增：存后端传回来的带批注的 Word 文件流

  // 页面跳转函数
  const jumpToPlatform = (url) => {
    window.open(url, '_blank');
  };

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

        {/* 🌟 底部用户信息 (带有无敌的一键切号功能) */}
        <div
          onClick={() => setRole(role === 'student' ? 'teacher' : 'student')}
          style={{ padding: '20px', borderTop: '1px solid #ebeef5', display: 'flex', alignItems: 'center', cursor: 'pointer', transition: 'background 0.3s' }}
          title="点击一键切换学生/教师视角"
        >
          <div style={{ width: '36px', height: '36px', borderRadius: '50%', backgroundColor: role === 'student' ? '#1677ff' : '#52c41a', color: '#fff', display: 'flex', justifyContent: 'center', alignItems: 'center', fontWeight: 'bold', marginRight: '12px' }}>
            {role === 'student' ? '李' : '王'}
          </div>
          <div>
            <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#333' }}>
              {role === 'student' ? '李同学' : '王老师 (教授)'} 切换🔄
            </div>
            <div style={{ fontSize: '12px', color: '#999' }}>计算机科学与技术</div>
          </div>
        </div>
      </div>

      {/* 👉 右侧：A25 主功能区 */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* 顶部导航 Tabs */}
        <div style={{ height: '64px', backgroundColor: '#fff', borderBottom: '1px solid #ebeef5', display: 'flex', alignItems: 'center', padding: '0 32px', gap: '32px', flexShrink: 0 }}>
          {[
            { id: 'report', label: '📊 学情报告' },
            { id: 'grading', label: '📝 作业批改' },
            { id: 'agent', label: '🤖 AI 辅导助手' }
          ].map(tab => (
            <div key={tab.id} onClick={() => setActiveTab(tab.id)} style={{ cursor: 'pointer', fontWeight: activeTab === tab.id ? 'bold' : 'normal', color: activeTab === tab.id ? '#1677ff' : '#666', borderBottom: activeTab === tab.id ? '3px solid #1677ff' : '3px solid transparent', padding: '20px 0', transition: 'all 0.2s' }}>
              {tab.label}
            </div>
          ))}
        </div>

        {/* 动态内容展示区 */}
        <div style={{ flex: 1, padding: '32px', overflowY: 'auto' }}>

          {/* 🌟 全新升级的动态学情分析大屏 */}
          {activeTab === 'report' && (
             <div style={{ animation: 'fadeIn 0.4s', maxWidth: '1000px' }}>

               {/* 左上角增加极其显眼的身份切换器，用于路演装杯 */}
               <div style={{ marginBottom: '24px', display: 'flex', gap: '12px' }}>
                 <button onClick={() => setRole('student')} style={{ padding: '8px 16px', borderRadius: '8px', border: role === 'student' ? '2px solid #1677ff' : '1px solid #d9d9d9', backgroundColor: role === 'student' ? '#e6f4ff' : '#fff', cursor: 'pointer', fontWeight: 'bold', color: role === 'student' ? '#1677ff' : '#666' }}>👨‍🎓 李同学 (学生端)</button>
                 <button onClick={() => setRole('teacher')} style={{ padding: '8px 16px', borderRadius: '8px', border: role === 'teacher' ? '2px solid #52c41a' : '1px solid #d9d9d9', backgroundColor: role === 'teacher' ? '#f6ffed' : '#fff', cursor: 'pointer', fontWeight: 'bold', color: role === 'teacher' ? '#52c41a' : '#666' }}>👨‍🏫 王老师 (教务端)</button>
               </div>

               {/* 👨‍🎓 学生视角：个人学情雷达 */}
               {role === 'student' && (
                 <>
                   <h2 style={{ margin: '0 0 24px 0', color: '#333', display: 'flex', alignItems: 'center' }}>
                     <span style={{fontSize:'28px', marginRight:'8px'}}>📊</span> 个人能力跨度分析
                   </h2>
                   <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                     <div style={{ backgroundColor: '#fff', padding: '24px', borderRadius: '12px', border: '1px solid #ebeef5', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
                       <h3 style={{ marginTop: 0, color: '#555', fontSize: '16px', textAlign: 'center' }}>当前知识点掌握度 (AI动态评估)</h3>
                       <div style={{ height: '300px' }}>
                         <ResponsiveContainer width="100%" height="100%">
                           <RadarChart cx="50%" cy="50%" outerRadius="70%" data={[
                             { subject: '基础公式', A: 90, fullMark: 100 },
                             { subject: '数组公式', A: 45, fullMark: 100 },
                             { subject: '高级筛选', A: 60, fullMark: 100 },
                             { subject: '数据透视表', A: 85, fullMark: 100 }
                           ]}>
                             <PolarGrid />
                             <PolarAngleAxis dataKey="subject" tick={{ fill: '#666', fontSize: 12 }} />
                             <PolarRadiusAxis angle={30} domain={[0, 100]} />
                             <Radar name="李同学" dataKey="A" stroke="#1677ff" fill="#1677ff" fillOpacity={0.6} />
                           </RadarChart>
                         </ResponsiveContainer>
                       </div>
                     </div>
                     <div style={{ backgroundColor: '#fff', padding: '24px', borderRadius: '12px', border: '1px solid #ebeef5', boxShadow: '0 4px 12px rgba(0,0,0,0.05)', display: 'flex', flexDirection: 'column' }}>
                       <h3 style={{ marginTop: 0, color: '#cf1322', fontSize: '16px', borderBottom: '1px solid #ffe58f', paddingBottom: '8px' }}>🚨 核心薄弱点预警</h3>
                       <p style={{ color: '#555', lineHeight: '1.6', flex: 1 }}>
                         根据你最近的作业批改记录，A25 引擎发现你在 <strong>“数组公式 (Ctrl+Shift+Enter)”</strong> 上存在高频错误。<br/><br/>
                         <strong>💡 AI 学习建议：</strong>建议在下方寻找智能助教，输入：“请给我出 3 道关于数组公式的选择题”。
                       </p>
                       <button onClick={() => setActiveTab('agent')} style={{ padding: '12px', backgroundColor: '#1677ff', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>去找 AI 助教加练 🚀</button>
                     </div>
                   </div>
                 </>
               )}

               {/* 👩‍🏫 教师视角：真正的数据驱动看板 */}
               {role === 'teacher' && (
                 <>
                   <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '24px' }}>
                     <h2 style={{ margin: 0, color: '#333', display: 'flex', alignItems: 'center' }}>
                       <span style={{fontSize:'28px', marginRight:'8px'}}>👨‍🏫</span> 25计算机班 - 动态学情诊断看板
                     </h2>

                     {/* 🌟 核心触发器：上传你的原始成绩单 CSV */}
                     <div style={{ position: 'relative', overflow: 'hidden' }}>
                       <button style={{ backgroundColor: '#52c41a', color: '#fff', padding: '10px 20px', borderRadius: '8px', border: 'none', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', boxShadow: '0 4px 12px rgba(82,196,26,0.3)' }}>
                         {isAnalyzing ? '⏳ 数据急速挖掘中...' : '📂 导入本班原始成绩单 (CSV/Excel)'}
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

                   {/* 图表渲染区 */}
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

                       <div style={{ gridColumn: '1 / 3', backgroundColor: '#fffaf0', padding: '20px', borderRadius: '8px', borderLeft: '4px solid #faad14' }}>
                         <h4 style={{ margin: '0 0 8px 0', color: '#d46b08' }}>🤖 A25 智能教研建议：</h4>
                         <p style={{ margin: 0, color: '#666', fontSize: '14px', lineHeight: '1.6' }}>
                           通过对 {classData.total} 份成绩数据的全量计算，系统发现全班在 <strong>“{classData.weakest}”</strong> 科目上存在明显的短板。建议老师近期重点关注该科目的实操练习，A25 已为您生成相关随堂测验，是否一键下发？
                         </p>
                       </div>
                     </div>
                   ) : (
                     <div style={{ backgroundColor: '#fafafa', border: '2px dashed #d9d9d9', borderRadius: '12px', padding: '60px', textAlign: 'center', color: '#999' }}>
                       <span style={{ fontSize: '48px' }}>📂</span>
                       <h3 style={{ margin: '16px 0 8px 0', color: '#666' }}>请点击右上角按钮导入《Excel实验原始素材文件.csv》</h3>
                       <p>导入后，后端 Python 将极速计算平均分和区间分布，为您生成实时大屏</p>
                     </div>
                   )}
                 </>
               )}
             </div>
          )}

          {/* 📝 作业批改功能区 */}
          {activeTab === 'grading' && (
            <div style={{ animation: 'fadeIn 0.3s', maxWidth: '800px' }}>
              <h2 style={{ margin: '0 0 24px 0', color: '#333' }}>智能作业批注系统</h2>

              <div style={{ backgroundColor: '#fff', padding: '32px', borderRadius: '12px', border: '1px solid #ebeef5', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>

                <div style={{ marginBottom: '24px' }}>
                  <div style={{ fontWeight: 'bold', color: '#333', marginBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                      <span style={{ width: '24px', height: '24px', backgroundColor: '#1677ff', color: '#fff', borderRadius: '50%', display: 'flex', justifyContent: 'center', alignItems: 'center', marginRight: '8px', fontSize: '14px' }}>1</span>
                      请输入原题内容，或上传题目文档：
                    </div>

                    <div style={{ position: 'relative', overflow: 'hidden', display: 'inline-block' }}>
                      <button style={{ padding: '6px 12px', backgroundColor: '#f0f2f5', border: '1px solid #d9d9d9', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', color: '#666', transition: 'all 0.3s' }}>
                        📎 自动提取 Word / PDF
                      </button>
                      <input
                        type="file"
                        accept=".pdf,.docx"
                        title="上传题目文档"
                        onChange={async (e) => {
                          const file = e.target.files[0];
                          if (!file) return;

                          setQuestionText("正在拼命读取文档内容，请稍候...");

                          const formData = new FormData();
                          formData.append('file', file);

                          try {
                            const res = await fetch('http://localhost:8000/api/parse_question_file', {
                              method: 'POST',
                              body: formData
                            });
                            const data = await res.json();
                            if (data.status === 'success') {
                              setQuestionText(data.text);
                            } else {
                              alert("解析失败：" + data.error);
                              setQuestionText("");
                            }
                          } catch (err) {
                            alert("网络错误，请确保后端服务已启动！");
                            setQuestionText("");
                          }
                          e.target.value = null;
                        }}
                        style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer' }}
                      />
                    </div>
                  </div>

                  <textarea
                    value={questionText}
                    onChange={(e) => setQuestionText(e.target.value)}
                    placeholder="例如：请用 C++ 实现一个快速排序算法...（你也可以点击右上角按钮直接上传老师发的作业文档）"
                    style={{ width: '100%', height: '120px', padding: '12px', borderRadius: '8px', border: '1px solid #d9d9d9', resize: 'vertical', outline: 'none', fontFamily: 'inherit' }}
                  />
                </div>

                <div>
                  <div style={{ fontWeight: 'bold', color: '#333', marginBottom: '12px', display: 'flex', alignItems: 'center' }}>
                    <span style={{ width: '24px', height: '24px', backgroundColor: '#1677ff', color: '#fff', borderRadius: '50%', display: 'flex', justifyContent: 'center', alignItems: 'center', marginRight: '8px', fontSize: '14px' }}>2</span>
                    上传你的解答（支持图片、代码或 Word 文档）：
                  </div>

                  <div style={{ border: '2px dashed #1677ff', backgroundColor: fileData ? '#f6ffed' : '#e6f4ff', borderRadius: '12px', padding: '30px', textAlign: 'center', position: 'relative' }}>
                    <input
                      type="file"
                      accept="image/*,.c,.cpp,.py,.txt,.docx"
                      onChange={(e) => {
                        const file = e.target.files[0];
                        if (!file) return;
                        const reader = new FileReader();

                        if (file.type.startsWith('image/')) {
                          setFileType('image');
                          reader.readAsDataURL(file);
                          reader.onload = () => setFileData(reader.result);
                        } else if (file.name.endsWith('.docx')) {
                          setFileType('docx');
                          reader.readAsDataURL(file);
                          reader.onload = () => setFileData(reader.result);
                        } else {
                          setFileType('text');
                          reader.readAsText(file);
                          reader.onload = () => setFileData(reader.result);
                        }
                      }}
                      style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer' }}
                    />
                    <span style={{ fontSize: '40px' }}>{fileData ? '✅' : '📤'}</span>
                    <h3 style={{ margin: '16px 0 8px 0', color: fileData ? '#52c41a' : '#1677ff' }}>
                      {fileData ? '文件已就绪，可点击重新选择' : '点击此处选择你的作业文件'}
                    </h3>
                  </div>
                </div>

                <button
                  disabled={!questionText || !fileData || isGrading}
                  onClick={async () => {
                    setIsGrading(true);
                    setGradingResult(null);
                    setAnnotatedFile(null);

                    try {
                      const res = await fetch('http://localhost:8000/api/grade_homework', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          user_id: "student_001",
                          course_id: "计算机科学",
                          question_text: questionText,
                          content_type: fileType,
                          content: fileData
                        })
                      });
                      const data = await res.json();
                      if (data.status === 'success') {
                         setGradingResult(JSON.parse(data.grading_result));
                         if (data.annotated_file) {
                             setAnnotatedFile(data.annotated_file);
                         }
                      } else {
                         alert("批改出错：" + JSON.stringify(data));
                      }
                    } catch (err) {
                      console.error(err);
                      alert("请求失败，请确保 FastAPI 后端在 8000 端口运行！");
                    } finally {
                      setIsGrading(false);
                    }
                  }}
                  style={{ width: '100%', marginTop: '32px', padding: '14px 0', backgroundColor: (questionText && fileData && !isGrading) ? '#1677ff' : '#ccc', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '16px', fontWeight: 'bold', cursor: (questionText && fileData && !isGrading) ? 'pointer' : 'not-allowed', boxShadow: '0 4px 12px rgba(22,119,255,0.3)' }}
                >
                  {isGrading ? '⏳ AI 教授正在深度审阅中...' : '✨ 开始 AI 智能批注'}
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
                      <div style={{ fontWeight: 'bold', color: '#d46b08', marginBottom: '8px' }}>
                        📍 {ann.location} <span style={{ fontSize: '12px', backgroundColor: '#faad14', color: '#fff', padding: '2px 8px', borderRadius: '12px', marginLeft: '8px' }}>{ann.error_type}</span>
                      </div>
                      <div style={{ color: '#cf1322', marginBottom: '8px', fontSize: '14px' }}><strong>❌ 问题分析：</strong>{ann.explanation}</div>
                      <div style={{ color: '#08979c', fontSize: '14px' }}><strong>💡 修改建议：</strong>{ann.suggestion}</div>
                    </div>
                  ))}

                  {annotatedFile && (
                    <button
                      onClick={() => {
                        const a = document.createElement('a');
                        a.href = annotatedFile;
                        a.download = 'A25智能批改报告.docx';
                        a.click();
                      }}
                      style={{ marginTop: '24px', padding: '12px 24px', width: '100%', backgroundColor: '#52c41a', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '16px', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', transition: 'all 0.3s', boxShadow: '0 4px 12px rgba(82,196,26,0.3)' }}
                    >
                      📥 下载带有 AI 批注的原生 Word 文档
                    </button>
                  )}

                </div>
              )}

            </div>
          )}

          {/* 🤖 AI 辅导助手 */}
          {activeTab === 'agent' && (
             <div style={{ animation: 'fadeIn 0.3s' }}>
             <h2 style={{ margin: '0 0 24px 0', color: '#333' }}>专属答疑空间</h2>
             <div style={{ backgroundColor: '#fff', height: '400px', borderRadius: '12px', border: '1px solid #ebeef5', display: 'flex', flexDirection: 'column', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
               <div style={{ flex: 1, color: '#999', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                 [ 对话记录区域 ]
               </div>
               <div style={{ display: 'flex', gap: '12px', marginTop: '16px' }}>
                 <input type="text" placeholder="输入你想问的课程问题..." style={{ flex: 1, padding: '12px 16px', borderRadius: '8px', border: '1px solid #d9d9d9', outline: 'none' }} />
                 <button style={{ padding: '0 24px', backgroundColor: '#1677ff', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}>发送</button>
               </div>
             </div>
           </div>
          )}

        </div>
      </div>
    </div>
  );
}