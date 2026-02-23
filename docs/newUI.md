新拟态 (Neumorphism) UI 设计规范与实现指南

基于提供的 UI 视觉图和代码实现，提取以下核心设计 Token 和组件风格。这套设计的核心在于温润的暖色调与极致柔和的光影过渡。

1. 核心色彩系统 (Color System)

新拟态极其依赖背景色与阴影颜色的完美契合。这套 UI 摒弃了传统的冷灰色，采用了一套自带高级感的“拿铁/奶茶”色系。

基础背景与高亮

主背景色 (Base Background): #F1EBE1 —— 温暖的米白色，作为整个 UI 的“材质”基底。所有的凸起和凹陷都是由这个颜色衍生出来的。

环境背景 (Environment): #E4DED4 —— 比主背景稍暗，用于衬托主界面（如手机外壳边缘）。

强调色/激活态 (Active Accent): #8F8072 —— 偏灰的棕咖色，用于极其克制的高亮（如分页器当前页），避免破坏整体柔和感。

文本层级 (Typography Colors)

主文本 (Primary Text): #33312E —— 深灰棕色。避免使用纯黑 #000000，以保持界面的柔和度。

副文本 (Muted Text): #6B6762 —— 用于描述性段落。

辅助文本 (Light Text): #9C978F —— 用于时间戳或极次要信息。

2. 光影与深度机制 (Shadow & Depth)

新拟态的灵魂在于“同色系多重阴影”。设定光源来自左上角。

高光颜色 (Highlight): #FFFFFF (纯白)

暗影颜色 (Shadow): #D5D0C4 (基底色的加深版)

在 Tailwind CSS 中，我们通过以下 3 个级别的阴影来实现丰富的 Z 轴空间感：

Level 1: 大凸起 (Large Outset)

用于承载内容的大型容器，如卡片（Cards）和底部悬浮栏。

CSS: box-shadow: 10px 10px 20px #d5d0c4, -10px -10px 20px #ffffff;

Tailwind: shadow-[10px_10px_20px_#d5d0c4,-10px_-10px_20px_#ffffff]

Level 2: 小凸起 (Small Outset)

用于可交互的小型控件，如顶部导航按钮、悬浮图标、"Prev/Next" 按钮。

CSS: box-shadow: 5px 5px 10px #d5d0c4, -5px -5px 10px #ffffff;

Tailwind: shadow-[5px_5px_10px_#d5d0c4,-5px_-5px_10px_#ffffff]

Level 3: 小凹陷 (Small Inset)

用于展示区域的背景底盘或未激活的状态，如卡片内的图片区、未选中的分页数字。

CSS: box-shadow: inset 4px 4px 8px #d5d0c4, inset -4px -4px 8px #ffffff;

Tailwind: shadow-[inset_4px_4px_8px_#d5d0c4,inset_-4px_-4px_8px_#ffffff]

3. 几何与元素风格 (Geometry & Elements)

圆角 (Border Radius)

新拟态强依赖大圆角来体现“软塑料”或“硅胶”的材质感。严禁使用直角。

大型容器 (卡片, 悬浮底栏): 32px (rounded-[2rem] 或 rounded-[3rem])

中型元素 (图片区, 大按钮): 16px (rounded-2xl)

小型元素 (图标背景): 12px (rounded-xl)

圆形控件 (分页器): 100% (rounded-full)

核心组件库范例

1. 内容卡片 (Card)

结构: 大凸起背景 -> 内部包含小凹陷图片区 -> 文字区。

视觉拆解: 图片展示区使用了内阴影 (inset) 制造了一个“坑”，然后在这个坑里放置了一个带外阴影的小图标（如照片或开关），形成“坑里有个小岛”的错落有致的 3D 感。

2. 按钮状态设计 (Button Interactivity)
为了让界面不仅看起来像实体，摸起来也像：

Default (默认态): 使用 Small Outset 凸起。

Active (按下态): 缩放变小 (active:scale-95)，且阴影瞬间翻转为内阴影 (active:shadow-[inset_2px_2px_5px_#d5d0c4,inset_-2px_-2px_5px_#ffffff])，模拟实体按键被按下的物理阻尼感。

3. 微发光特效 (Glow Effect)

在部分凸起的 Icon 背后，加入了一层极淡的有色模糊背景，例如 bg-yellow-600/20 blur-md，这打破了新拟态容易产生的单调感，增加了一丝赛博或者现代电子设备的质感。

---

4. ExecLink 落地映射 (Implementation Mapping)

为避免规范与代码脱节，本项目按以下文件映射执行新拟态：

- 全局 Token 与基础层：`src/styles.css`
  - `--ui-base`: `#F1EBE1`
  - `--ui-env`: `#E4DED4`
  - `--ui-accent`: `#8F8072`
  - `--ui-text`: `#33312E`
  - `--ui-muted`: `#6B6762`
  - `--ui-light`: `#9C978F`
  - `--ui-shadow`: `#D5D0C4`
  - `--ui-highlight`: `#FFFFFF`

- 页面骨架与分区布局：`src/pages/Home.tsx`
  - 顶层容器、Tab 底盘、面板块、Toast 使用统一阴影层级
  - 品牌绿仅用于 `ExecLink` 字样与轻微 glow 点缀

- CLI 主卡片与拖拽区：`src/components/CliConfigTable.tsx`
  - 大卡片使用 `Level 1 (Large Outset)`
  - 输入区/底盘使用 `Level 3 (Small Inset)`
  - 按钮/标签/开关使用 `Level 2 (Small Outset)`
  - 按压态统一：`active:scale-95 + inset shadow`

- 行开关组件：`src/components/ToggleRow.tsx`
  - 卡片行 + 拨杆开关均采用新拟态外凸和按压反馈

- 状态列表组件：`src/components/CliStatusList.tsx`
  - 保持与主界面一致的圆角、色阶和深度语言

5. 实施约束

- 禁止回退到冷灰扁平风格（纯白背景 + 细边框 + 单层阴影）。
- 新增组件需复用本规范 Token 与三层阴影语义，不得随意定义新色系。
- 在移动端（<=540px）保持可点击区域与文字可读性优先。
