import React, { useState } from 'react';

export default function UserPortal() {
  const [activeTab, setActiveTab] = useState('report'); // 默认选中学情报告

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw', backgroundColor: '#f5f7fa', fontFamily: 'sans-serif' }}>

      {/* 👈 左侧：第三方平台转接枢纽 */}
      <div style={{ width: '240px', backgroundColor: '#fff', borderRight: '1px solid #ebeef5', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '24px 20px', fontSize: '20px', fontWeight: 'bold', color: '#1677ff', borderBottom: '1px solid #ebeef5', display: 'flex', alignItems: 'center' }}>
          <span style={{ fontSize: '24px', marginRight: '8px' }}>🎓</span> A25 学习中心
        </div>

        <div style={{ padding: '20px', flex: 1 }}>
          <div style={{ marginBottom: '16px', fontSize: '13px', color: '#999', fontWeight: 'bold' }}>我的教学平台</div>

          <button style={{ width: '100%', padding: '12px 16px', marginBottom: '12px', backgroundColor: '#f0f2f5', border: 'none', borderRadius: '8px', cursor: 'pointer', textAlign: 'left', fontWeight: 'bold', color: '#333', transition: 'background 0.2s' }} onMouseEnter={e => e.target.style.backgroundColor = '#e6f4ff'} onMouseLeave={e => e.target.style.backgroundColor = '#f0f2f5'}>
            📘 超星学习通
          </button>
          <button style={{ width: '100%', padding: '12px 16px', marginBottom: '12px', backgroundColor: '#f0f2f5', border: 'none', borderRadius: '8px', cursor: 'pointer', textAlign: 'left', fontWeight: 'bold', color: '#333', transition: 'background 0.2s' }} onMouseEnter={e => e.target.style.backgroundColor = '#e6f4ff'} onMouseLeave={e => e.target.style.backgroundColor = '#f0f2f5'}>
            🌂 雨课堂
          </button>
          <button style={{ width: '100%', padding: '12px 16px', marginBottom: '12px', backgroundColor: '#f0f2f5', border: 'none', borderRadius: '8px', cursor: 'pointer', textAlign: 'left', fontWeight: 'bold', color: '#333', transition: 'background 0.2s' }} onMouseEnter={e => e.target.style.backgroundColor = '#e6f4ff'} onMouseLeave={e => e.target.style.backgroundColor = '#f0f2f5'}>
            🌳 智慧树
          </button>
        </div>

        {/* 底部用户信息 */}
        <div style={{ padding: '20px', borderTop: '1px solid #ebeef5', display: 'flex', alignItems: 'center' }}>
          <div style={{ width: '36px', height: '36px', borderRadius: '50%', backgroundColor: '#1677ff', color: '#fff', display: 'flex', justifyContent: 'center', alignItems: 'center', fontWeight: 'bold', marginRight: '12px' }}>李</div>
          <div>
            <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#333' }}>李同学</div>
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
            <div
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                cursor: 'pointer',
                fontWeight: activeTab === tab.id ? 'bold' : 'normal',
                color: activeTab === tab.id ? '#1677ff' : '#666',
                borderBottom: activeTab === tab.id ? '3px solid #1677ff' : '3px solid transparent',
                padding: '20px 0',
                transition: 'all 0.2s'
              }}
            >
              {tab.label}
            </div>
          ))}
        </div>

        {/* 动态内容展示区 */}
        <div style={{ flex: 1, padding: '32px', overflowY: 'auto' }}>

          {activeTab === 'report' && (
            <div style={{ animation: 'fadeIn 0.3s' }}>
              <h2 style={{ margin: '0 0 24px 0', color: '#333' }}>近期学习跨度分析</h2>
              <div style={{ backgroundColor: '#fff', padding: '24px', borderRadius: '12px', border: '1px solid #ebeef5', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                <p style={{ color: '#666', marginBottom: '16px' }}>系统检测到你在《C++程序设计》与《数据结构》中存在关联性知识薄弱点。</p>
                <div style={{ height: '200px', backgroundColor: '#f9fafb', borderRadius: '8px', display: 'flex', justifyContent: 'center', alignItems: 'center', color: '#999', border: '1px dashed #d9d9d9' }}>
                  [ 这里预留给雷达图或折线图组件 ]
                </div>
              </div>
            </div>
          )}

          {activeTab === 'grading' && (
            <div style={{ animation: 'fadeIn 0.3s' }}>
              <h2 style={{ margin: '0 0 24px 0', color: '#333' }}>智能作业批注</h2>
              <div style={{ border: '2px dashed #1677ff', backgroundColor: '#e6f4ff', borderRadius: '12px', padding: '40px', textAlign: 'center', cursor: 'pointer' }}>
                <span style={{ fontSize: '40px' }}>📤</span>
                <h3 style={{ margin: '16px 0 8px 0', color: '#1677ff' }}>拖拽或点击上传作业</h3>
                <p style={{ color: '#666', fontSize: '14px', margin: 0 }}>支持代码文件 (.cpp, .py) 或 纸质作业截图</p>
              </div>
            </div>
          )}

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