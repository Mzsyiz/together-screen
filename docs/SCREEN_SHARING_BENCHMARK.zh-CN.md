# 主流屏幕共享产品参数参考

[English](SCREEN_SHARING_BENCHMARK.md) | 简体中文

本页只记录厂商公开资料能够确认的参数。厂商未公开的码率不会被写成官方值。

## 公开参数对比

| 产品 | 公开分辨率/帧率 | 公开带宽或码率 | 备注 |
| --- | --- | --- | --- |
| Zoom | 会议视频最高 1080p；具体屏幕共享帧率未在带宽文档中给出 | 群组 1080p 视频建议上行 3.8 Mbps、下行 3.0 Mbps；纯屏幕共享建议 50–75 Kbps，带视频缩略图 50–150 Kbps | 屏幕共享值属于 Zoom 官方带宽规划建议，不等于编码器固定码率 |
| Microsoft Teams | 视频和内容最高 1080p、30 FPS | 会议屏幕共享推荐 2.5/2.5 Mbps，Best Performance 4/4 Mbps；推荐内容帧率自适应 7.5–30 FPS | Teams 明确说明优先保证音频，并根据网络动态降级 |
| Discord | 免费用户最高 720p/30 FPS；Nitro/Nitro Classic 最高 4K/60 FPS；iOS Nitro 最高 1080p/60 FPS | Discord 未公开标准码率 | 社区常见 720p/30 FPS 约 1.5–3 Mbps，只能作为估算 |
| Google Meet | 发送/接收选项最高 1080p，并提供 720p、360p | Google 未公开屏幕共享专用码率 | 1080p 发送受套餐、浏览器、设备和性能限制 |
| Tencent RTC / TRTC | SDK 允许配置屏幕共享分辨率和帧率 | 可通过子流编码参数配置码率 | 腾讯会议消费端没有公开统一码率表；TRTC 参数不能直接视为腾讯会议产品当前配置 |

## 对本项目的启示

1. 主流产品普遍把 1080p 作为办公共享的主档位，而不是让用户直接填写编码参数。
2. 办公和文档内容通常使用较低帧率，动态内容再提高帧率。
3. 网络不足时先降低帧率、质量或分辨率，并始终优先保持音频。
4. 静态屏幕共享的实际码率可能远低于上限，因为编码器能够压缩未变化区域。
5. 4K/60 FPS 属于高端游戏或专业共享能力，不应作为默认值。

## Together Screen 当前标准

| 模式 | 参数 | 场景 |
| --- | --- | --- |
| 轻量 | 360p / 15 FPS / 0.8 Mbps | 弱网和最低带宽查看 |
| 流畅 | 720p / 10 FPS / 1.5 Mbps | 聊天、普通浏览、弱网 |
| 标准 | 1080p / 15 FPS / 2.5 Mbps | 办公、网页、文档、代码 |
| 高清 | 1080p / 30 FPS / 4 Mbps | 软件演示、动画、视频 |
| 超清 | 1440p / 30 FPS / 8 Mbps | 精细桌面和高分辨率内容 |
| 游戏 | 1080p / 60 FPS / 8 Mbps | 游戏和快速运动 |
| 4K | 2160p / 30 FPS / 20 Mbps | 4K 演示 |

所有房间开放同一组七档参数，默认“标准”。实际码率是上限，不会固定占满。

## 官方来源

- Zoom：<https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0060748>
- Microsoft Teams：<https://learn.microsoft.com/en-us/microsoftteams/prepare-network>
- Discord：<https://support.discord.com/hc/en-us/articles/360040816151-Go-Live-and-Screen-Share>
- Google Meet：<https://support.google.com/meet/answer/9302964>
- Tencent Cloud TRTC：<https://cloud.tencent.com/document/product/647>

资料核对日期：2026-11-06。
