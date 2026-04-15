/**
 * A25 智能助教 - 多平台穿透版（超星学习通 + 雨课堂）
 * 顶级窗口：注入悬浮 widget iframe，转发子 frame 上报的课件上下文
 * 子 frame：轮询/监听课件区图片，postMessage 到 top
 */
(function () {
    if (window.location.href.includes('cpolar')) return;

    var WIDGET_SRC = 'https://4f503544.r3.cpolar.top/?page=widget';//每次生成的不同的cpolar网址

    function isChaoxingHost() {
        return location.hostname.indexOf('chaoxing.com') !== -1;
    }

    function isYuketangHost() {
        var h = location.hostname;
        return h === 'yuketang.cn' || h.endsWith('.yuketang.cn') ||
            h === 'ykt.io' || h.endsWith('.ykt.io');
    }

    function detectPlatform() {
        if (isChaoxingHost()) return 'chaoxing';
        if (isYuketangHost()) return 'yuketang';
        return 'unknown';
    }

    // ---------- 顶部：悬浮窗壳 ----------
    if (window === window.top) {
        var plat = detectPlatform();
        if (plat === 'chaoxing' || plat === 'yuketang') {
            console.log('A25 总指挥部启动 [' + plat + ']');

            if (!document.getElementById('a25-sidebar')) {
                var sidebar = document.createElement('iframe');
                sidebar.id = 'a25-sidebar';
                sidebar.src = WIDGET_SRC;
                sidebar.setAttribute('title', 'A25 智能助教');
                sidebar.setAttribute('allow', 'clipboard-read; clipboard-write');

                var margin = 20;
                var pos = { right: margin, bottom: margin };
                var size = { w: 60, h: 60 };

                function applySidebarGeometry() {
                    sidebar.style.cssText = [
                        'position:fixed',
                        'z-index:2147483647',
                        'border:none',
                        'outline:none',
                        'background:transparent',
                        'pointer-events:auto',
                        'overflow:hidden',
                        'transition:width 0.25s ease,height 0.25s ease',
                        'width:' + size.w + 'px',
                        'height:' + size.h + 'px',
                        'right:' + pos.right + 'px',
                        'bottom:' + pos.bottom + 'px',
                        'top:auto',
                        'left:auto',
                        'box-shadow:none'
                    ].join(';');
                }
                applySidebarGeometry();
                document.body.appendChild(sidebar);

                function clampGeometry() {
                    var vw = window.innerWidth;
                    var vh = window.innerHeight;
                    size.w = Math.min(size.w, vw - 8);
                    size.h = Math.min(size.h, vh - 8);
                    pos.right = Math.max(4, Math.min(pos.right, vw - size.w - 4));
                    pos.bottom = Math.max(4, Math.min(pos.bottom, vh - size.h - 4));
                }

                window.addEventListener('resize', function () {
                    clampGeometry();
                    applySidebarGeometry();
                });

                window.addEventListener('message', function (event) {
                    if (!event.data || typeof event.data !== 'object') return;

                    if (event.data.type === 'A25_SUB_FRAME_REPORT') {
                        if (event.source === sidebar.contentWindow) return;
                        try {
                            sidebar.contentWindow.postMessage({
                                type: 'A25_PAGE_CONTEXT',
                                platform: event.data.platform || plat,
                                title: event.data.data.title,
                                content: event.data.data.content,
                                images: event.data.data.images,
                                url: event.data.data.url
                            }, '*');
                        } catch (e) { /* iframe 未就绪 */ }
                        return;
                    }

                    if (event.source !== sidebar.contentWindow) return;

                    if (event.data.type === 'A25_RESIZE') {
                        var w = parseInt(String(event.data.width), 10);
                        var h = parseInt(String(event.data.height), 10);
                        if (!isNaN(w) && !isNaN(h)) {
                            size.w = w;
                            size.h = h;
                            clampGeometry();
                            applySidebarGeometry();
                        }
                        return;
                    }

                    if (event.data.type === 'A25_MOVE_DELTA') {
                        var dx = Number(event.data.dx) || 0;
                        var dy = Number(event.data.dy) || 0;
                        pos.right -= dx;
                        pos.bottom -= dy;
                        clampGeometry();
                        applySidebarGeometry();
                    }
                });
            }
        }
    }

    // ---------- 采集可见课件图（过滤小图标）----------
    function collectSlideImages(maxN) {
        maxN = maxN || 3;
        var imgs = document.querySelectorAll('img');
        var out = [];
        for (var i = 0; i < imgs.length && out.length < maxN; i++) {
            var img = imgs[i];
            var src = img.src || img.getAttribute('data-src') || img.getAttribute('data-original') || img.getAttribute('data-lazy-src');
            if (!src || (src.indexOf('http') !== 0 && src.indexOf('//') !== 0)) continue;
            if (src.indexOf('//') === 0) src = location.protocol + src;
            var w = img.naturalWidth || img.width || 0;
            var h = img.naturalHeight || img.height || 0;
            if (w > 0 && h > 0 && (w < 64 || h < 64)) continue;
            out.push(src);
        }
        return out;
    }

    function postReportToTop(platform, title, images, contentHint) {
        try {
            window.top.postMessage({
                type: 'A25_SUB_FRAME_REPORT',
                platform: platform,
                data: {
                    title: title,
                    content: contentHint || '[系统提示] 这是截取的课件图片，AI已获取视觉画面。',
                    images: images,
                    url: window.location.href
                }
            }, '*');
        } catch (e) {
            console.warn('A25 postReport failed', e);
        }
    }

    // ---------- 超星：pan-yz 课件区（单次雷达）----------
    if (isChaoxingHost() && window.location.href.indexOf('pan-yz.chaoxing.com') !== -1) {
        console.log('A25 雷达：超星 panView');
        var attemptsCx = 0;
        var radarCx = setInterval(function () {
            attemptsCx++;
            var images = collectSlideImages(3);
            if (images.length > 0) {
                var hiddenTitleInput = document.getElementById('fileInfoNameInput');
                var fileTitle = (hiddenTitleInput && hiddenTitleInput.value) ? hiddenTitleInput.value : document.title;
                postReportToTop('chaoxing', '📄 核心课件: ' + fileTitle, images, null);
                clearInterval(radarCx);
            } else if (attemptsCx > 15) {
                clearInterval(radarCx);
            }
        }, 1000);
    }

    // ---------- 雨课堂：多 frame 可能出现，翻页后 URL 或图片会变 —— 轮询更新 ----------
    function shouldRunYuketangRadar() {
        if (!isYuketangHost()) return false;
        var path = location.pathname.toLowerCase();
        if (path === '/' || path.indexOf('/static/') === 0) return false;
        var hints = ['v2', 'web', 'lesson', 'learn', 'course', 'classroom', 'video', 'ppt', 'slide', 'rain', 'index.html'];
        for (var i = 0; i < hints.length; i++) {
            if (path.indexOf(hints[i]) !== -1) return true;
        }
        return path.length > 1;
    }

    if (shouldRunYuketangRadar()) {
        console.log('A25 雷达：雨课堂', location.href);

        var lastSig = '';
        var yktAttempts = 0;
        var yktMaxAttempts = 200;

        function yktTitle() {
            var og = document.querySelector('meta[property="og:title"]');
            if (og && og.content) return og.content.trim();
            var h1 = document.querySelector('h1');
            if (h1 && h1.textContent) return h1.textContent.trim().slice(0, 120);
            return document.title || '雨课堂课件';
        }

        function tickYkt() {
            yktAttempts++;
            var images = collectSlideImages(3);
            var sig = images.join('|');
            if (images.length > 0 && sig !== lastSig) {
                lastSig = sig;
                postReportToTop('yuketang', '📘 雨课堂: ' + yktTitle(), images, null);
            }
            if (yktAttempts >= yktMaxAttempts) {
                clearInterval(yktTimer);
            }
        }

        var yktTimer = setInterval(tickYkt, 2500);
        tickYkt();
    }
})();
