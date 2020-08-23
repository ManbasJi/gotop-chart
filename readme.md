## 数据
### K线数据
- 在线
  - 功能：可设置每次最多加载多少条数据，分页加载，有refreshNew 和 loadMore 的功能，refreshNew需要实时获取最新数据，loadMore则需被动触发加载；
  - 场景：实盘
- 离线
  - 功能：可设置每次最多加载多少条数据，分页加载；如果不需要分页加载，加载更多的接口配置 **loadMoreConfig** 不需要进行配置
  - 场景：回测记录
- 功能实现
  1. 获取元数据时，开始和结束都要整点数；
  2. 1min -> 5min：从整点开始，每5根K线组成一条，时间为这5条K线中的第一条；最高价为5条K线中的Max(H),最低价为Min(L),开盘价为第一条K线的O,收盘价为最后一条K线的C；
  3. 每次切换周期，在没有缓存的情况下，都对现有的所有原数据进行计算合并；
  4. 获取更多K线数据也是需要整点获取，如果当前处在5min，获取更多数据获取的是1min的数据，然后再进行合并缓存；

### 画图工具
- 基础元件：线条、字体、矩形

1. 线条
   - name：line
   - attr：color,lineWidth
   - position：price1,kIndex1 & price2,kIndex2 
   - level

2. 字体
   - name: text
   - attr: color,fontSize,backgroundColor,border
   - position:price,kIndex
   - level
3. 矩形
   - name: rect
   - attr: backgroundColor,border
   - position: price1,kIndex1 & price2,kIndex2 & price3,kIndex3 & price4,kIndex4 
   - level

- 层级：所有的元件通过list进行存放，list中的顺序即是元件层级的顺序；不采用数值大小来进行排序，考虑到元件非常多的情况下，改动一个元件的顺序，其他部分元件的顺序都要进行改动。
- 问题
1. 当元件一部分在可视范围内，一部分在不可视范围外的时候，要如何进行处理
     - 通过对元件可视与不可视范围边界求值，对于不可视范围的内容不要进行绘制，不过这种方式对于字体元件则需要计算元件起点到边界的距离，算出可视范围可以显示多少个字体，然后绘制其中一部分字体
     - 通过添加多个canvas，进行遮盖；为每一个图表设置单独一个drawCanvas，这样超出drawCanvas部分的内容则自动不会显示，这种方式可能会出现卡顿的现象


#### HQ绘图方式
1. **光标模式**
  在该模式下，最先开始会对背景静态图 进行 截图，然后每次移动光标，都会重新将 截图 覆盖给canvas，然后再绘制光标
2. **数据拖动模式**
  每次拖动都会 clearRect，draw，getImageData，drawLine,putImageData
3. **画图模式**
  每次移动都会 putImageData（不包括画图），drawLine（所有图形重新绘制）
> 由于hq是单张canvas，所以保存静态的imageData，可以避免静态部分的内容多次重复绘制。
> 对于画图对象不进行截图，主要是因为每个画图对象都可以进行重新的位置和大小的调整，所以还是属于动态对象。
> 每次 mousemove 都会对动态对象进行重绘。
> 也可以用两张canvas，一张绘制动态，一张绘制静态。对于画图对象的部分绘制在动态canvas上面，每次mousemove都对于动态canvas进行重绘。

#### 绘图方案
1. 目前使用两张canvas，在画图对象比较多的情况下，光标的移动会导致卡顿，因为每次光标移动都会导致canvas重绘。
   1. 可以再增加一张画布，主要用来放置画图工具对象的
2. 超出画布的部分可以很自然的 覆盖掉，但是因为我使用的是一张画布进行多个区域的绘制，就必须要实现超出区域的部分不显示。
   1. 绘图的时候限制 画图对象 只能在对应的坐标系上面，超出部分将自动调整回坐标系中来。
   2. 通过线rect clip 可以确定绘制的区域，然后再进行画图

>1. 清空canvas
>再绘制每一帧动画之前，需要清空所有。清空所有最简单的做法就是clearRect()方法
>2. 保存canvas状态
>如果在绘制的过程中会更改canvas的状态(颜色、移动了坐标原点等),又在绘制每一帧时都是原始状态的话，则最好保存下canvas的状态
>3. 绘制动画图形
>这一步才是真正的绘制动画帧
>4. 恢复canvas状态
>如果你前面保存了canvas状态，则应该在绘制完成一帧之后恢复canvas状态

