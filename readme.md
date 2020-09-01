## 数据
### K线数据
- 模式
  - 在线：实时更新当前最新数据
  - 离线：只加载当前数据库已有的数据
  - 限定：只加载指定范围的数据
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

#### 点击事件
- client：针对浏览器可视区域，不包括border
- page：在client 的基础上加上滚动条的滚动距离
- offset：针对自身内容的有效区域 ，包括border
- screen：针对显示器窗口
- layer：如果元素有设置相对或绝对定位，参考点以页面为参考点，没有设置则以元素本身为参考点，包括border

##### 有mousedown的情况下监听某个元素的区域点击事件
需求：因为使用了mousedown，不管是点击哪个元素区域，都会触发到该事件；目前 画图工具对象 右键触发的弹窗 的点击事件越 mousedown 中的执行方法有冲突，所以必须实现当点击 画图工具对象弹窗的 时候，不要触发到mousedown事件。这样就需要监听当前点击的坐标是否存在于 画图工具对象弹窗 之中，此时 画图工具对象弹窗 的位置已经可以获取到。
分析：offset 是针对元素本身的，所以不能使用，layer也一样，其他几个都是针对页面级的，要使用的话就必须知道chart的具体位置。还有另外一种方式就是监听点击事件中的path，遍历其中是否有 画图工具对象弹窗 这个元素。
解决：使用offset，所以chart必须要有具体的位置。

#### 指标
1. 计算方式
   1. 对现有全部数据源进行计算：对于更新数据或加载更多的情况，就需要进行重新计算，如果可以把之前的指标数据保存下来，只计算更新的部分，可以节省计算的时间
   2. 针对当前显示的K线进行计算：每次移动改变当前显示的数据时都要进行计算，对于需要历史周期较远的指标，计算出来的结果就会不精确

## 设计
1. 图表的内容创建与更新的流程需要清楚，并且二者的流程应该尽可能统一，只要理清楚每次创建和更新的流程，把这些流程封装成统一的函数，那么逻辑上和维护性上面都是清晰的
   1. 创建图表流程
      1. 创建Element
      2. 设置Element大小
      3. 加载数据
      4. 初始化配置Option
      5. 创建FrameList
      6. 绘制FrameList
   2. 更新图表流程
      1. Size 的改变。图表主窗口Size的改变
         1. 设置Element大小
         2. 初始化配置Option
         3. 创建FrameList
         4. 绘制FrameList
      2. 画布上图形的改变（CrossCursor、DrawPicture）
         1. 清空OptCanvas画布
         2. CrossCursor绘制
         3. DrawPicture绘制
      3. FrameList的改变
         1. 清空所有画布
         2. 创建FrameList
         3. 绘制FrameList
      4. 数据的改变
         1. 加载数据
         2. 截取数据
         3. 绘制FrameList
2. 把创建和赋值拆分开来，后面再封装函数的时候更容易去调用


