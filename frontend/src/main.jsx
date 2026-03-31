import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import UserPortal from './platform.jsx' // 🌟 新增：把你的独立中台页面引进来

// 🌟 核心魔法：读取网址里的参数
const urlParams = new URLSearchParams(window.location.search);
const page = urlParams.get('page');

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {/* 根据网址参数决定渲染哪个组件：
        如果网址带了 ?page=portal，就渲染独立中台 UserPortal
        如果没带（默认情况），就渲染你的悬浮球插件 App */}
    {page === 'portal' ? <UserPortal /> : <App />}
  </StrictMode>,
)