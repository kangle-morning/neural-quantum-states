# 神经网络量子态 · Neural Quantum States 交互式讲解

一个**纯静态、零依赖**的交互式网页，用生动图示和可动手的实验讲解「神经网络量子态（NQS）」的原理、方法与近期进展。

- 🎯 指数墙可视化：拖动滑块看 `2^N` 如何甩开全宇宙的原子数
- 🧠 交互式 RBM 结构图：hover 神经元看权重、看隐藏层如何被激活
- 🎲 Metropolis 采样动画：直观理解「按 |ψ|² 采样」
- ⚗️ **现场训练**：在你的浏览器里真的跑一遍 VMC，用 RBM 逼近横场 Ising 链基态，实时看能量下降、保真度逼近 100%
- 🧬 架构演进时间线 & 2023–2025 近期进展卡片

## 运行方式

### 方式 A：直接打开（本地）

双击 `index.html` 即可，无需安装任何依赖、无需联网。

> 若想跑核心数值的冒烟测试：`node tests/smoke.js`

### 方式 B：部署到 GitHub Pages（推荐，便于挂到你个人主页）

1. 在 GitHub 新建一个仓库（例如 `neural-quantum-states`），把这几个文件推上去：
   ```
   index.html   style.css   main.js   quantum.js   README.md   tests/
   ```
2. 仓库 **Settings → Pages**，把 **Source** 设为 `Deploy from a branch`，分支选 `main`，目录选 `/ (root)`，保存。
3. 一两分钟后，页面就会出现在：
   ```
   https://<你的用户名>.github.io/neural-quantum-states/
   ```
4. 在你的**个人主页**（`<用户名>.github.io` 仓库的 `README.md` 或个人网站）里加上一行链接即可：
   ```markdown
   [神经网络量子态 · 交互式讲解](https://<你的用户名>.github.io/neural-quantum-states/)
   ```

> 不需要 `.nojekyll`、不需要构建、不需要 npm——纯 HTML/CSS/JS，GitHub Pages 开箱即用。

## 文件结构

| 文件 | 作用 |
| --- | --- |
| `index.html` | 页面结构与全部中文讲解内容 |
| `style.css` | 深色玻璃拟态主题、响应式布局 |
| `main.js` | 所有交互与 Canvas 动画（DOM 接线） |
| `quantum.js` | 纯数值核心：精确对角化 + RBM + VMC 训练（无 DOM，可单独测试） |
| `tests/smoke.js` | Node 冒烟测试：验证对角化与 VMC 收敛 |

## 核心物理

- 哈密顿量（周期边界横场 Ising 链）：`H = -J Σ ZᵢZᵢ₊₁ - g Σ Xᵢ`
- 变分波函数：受限玻尔兹曼机 `ψ(s) = e^{Σᵢaᵢsᵢ} ∏ⱼ 2cosh(bⱼ + Σᵢ Wᵢⱼ sᵢ)`
- 优化方法：变分蒙特卡洛（VMC），梯度 = `2·Cov(E_loc, ∂lnψ/∂θ)`，Adam 更新

横场 Ising 基态是「可斯托克化」的（σ^z 基下振幅非负），所以用**实参数 RBM** 就能忠实表示，从而让浏览器端的演示又快又直观。真实更复杂的系统（含相位/费米子/阻挫）则需要复数参数或更高级的架构——这正是页面后半部分「架构演进」和「近期进展」讲述的内容。
