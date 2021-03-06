function GoTopChart (element) {
  this.DivElement = element
  this.DivElement.className = "main-div"

  this.RightElement = document.createElement('div')

  this.ChartElement = document.createElement('div')
  this.ChartElement.className = 'chart-container'
  this.ChartElement.id = 'chart-container'

  this.TopToolContainer = new TopToolContainer()
  this.LeftToolContainer = new LeftToolContainer()

  this.DivElement.appendChild(this.LeftToolContainer.Create())
  this.DivElement.appendChild(this.RightElement)

  this.RightElement.appendChild(this.TopToolContainer.Create())
  this.RightElement.appendChild(this.ChartElement)

  this.Options

  this.Chart

  var self = this

  this.OnSize = function () {
    ChartSize.getInstance().TotalHeight = parseInt(this.DivElement.style.height.replace("px", ""))
    ChartSize.getInstance().TotalWidth = parseInt(this.DivElement.style.width.replace("px", ""))

    this.RightElement.style.width = ChartSize.getInstance().TotalWidth - ChartSize.getInstance().LeftToolWidthPx - g_GoTopChartResource.BorderWidth[0] + 'px'
    this.RightElement.style.height = ChartSize.getInstance().TotalHeight + 'px'

    this.TopToolContainer.SetWidth(this.RightElement.style.width)
    this.LeftToolContainer.SetHeight(this.RightElement.style.height)

    ChartSize.getInstance().ChartContentWidth = parseInt(this.RightElement.style.width.replace('px', ''))
    ChartSize.getInstance().ChartContentHeight = parseInt(this.RightElement.style.height.replace('px', '')) - ChartSize.getInstance().TopToolHeightPx - g_GoTopChartResource.BorderWidth[0]
    ChartSize.getInstance().ChartOffSetTop = this.DivElement.offsetTop
    ChartSize.getInstance().ChartOffSetLeft = this.DivElement.offsetLeft
  }

  this.SetOption = function (options) {
    this.Options = options
    this.Draw()
  }

  this.Draw = function () {
    if (!this.Chart) {
      this.Chart = new GoTopChartComponent()
      this.Chart.Options = this.Options
      this.Chart.ChartElement = this.ChartElement
      this.Chart.CreateElement()
      this.Chart.SetSize()
      this.Chart.SetFrameOption()
      this.Chart.SetChartFrameList()
      this.Chart.ProcessDrawPictureEleData()
      // 数据请求后进行回调
      var start = null
      // 离线模式需要确定start，在线模式不需要start和end，因为接口自动获取最新的已完成周期K线数据，还未完成的周期K线数据需要使用 websocket 获取
      if (this.Chart.Mode == 0) {
        start = 1577808000000
      }
      this.Chart.RequestNewData(this.Chart.Period, function (res) {
        ChartData.getInstance().DataOffSet = ChartData.getInstance().PeriodData[self.Chart.Period].Data.length - 1   // 初始化 DataOffSet
        self.Chart.LoadIndicatorData(ChartData.getInstance().PeriodData[self.Chart.Period].Data, 'new')   // 加载指标数据
        if (self.Chart.Mode == 1) {
          self.Chart.RequestRealTimeData()  // 开启websocket 实时请求K线最新数据
        } else {
          self.Chart.SplitData()    // 数据剪切
          self.Chart.Loaded()       // 关闭loading窗口
          self.Chart.Draw()         // 数据准备完成，开始绘制
        }
      }, start, null)
    } else {
      this.Chart.ChartElement = this.ChartElement
      this.Chart.Resize()
      this.Chart.SplitData()
      this.Chart.Draw()
    }
  }

  this.LeftToolContainer.RegisterClickEvent(function (e) {
    if (self.Chart) self.Chart.CreateDrawPictureTool(e.currentTarget.id)
  })

  this.TopToolContainer.RegisterClickEvent(function (id) {
    switch (id) {
      case 'goto_btn':
        self.Chart.GoToDialog.SetShow()
        break;
      case 'period-btn':
        break;
      case 'indicators-btn':
        break;
      case 'pre-signal-btn':
        break;
      case 'next-signal-btn':
        break;
      case 'save-btn':
        self.Chart.SaveDrawPicture()
        break;
    }
  })
}

GoTopChart.Init = function (element) {
  var chart = new GoTopChart(element)
  return chart
}

////////////////////////////////////////////
// 
//             图表组件
//
////////////////////////////////////////////
function GoTopChartComponent () {
  this.Options
  this.XOption = {}         // X轴的配置，一个图标库中只有一个X轴，所以独立出来
  this.KLineOption = {}     // K线图表的配置
  this.KLineChartFrameIndex  // 主图在ChartFrameList中的下标
  this.IndicatorDataList = {}          // 存放指标数据的list，如果指标窗口删除，则删除指定的指标

  this.ChartFramePaintingList = new Array()     // 存放图表框架绘制对象
  this.FrameList = new Array()                  // 存放图表框架
  this.DrawPictureToolList = new Array()            // 存放画图对象
  this.DrawPictureToolDeleteList = new Array()      // 存放删除的画图元素
  this.DrawPictureSaveIndex = null                     // drawPictureToolList中已经保存的数据下标

  this.CrossCursor = new CrossCursor()          // 光标

  // websocket
  this.JSWebSocket

  // canvas
  this.ChartElement
  this.CanvasElement = document.createElement('canvas')
  this.CanvasElement.className = "jschart-drawing"
  this.OptCanvasElement = document.createElement('canvas')
  this.OptCanvasElement.className = "jschart-opt-drawing"
  this.Canvas = this.CanvasElement.getContext('2d')
  this.OptCanvas = this.OptCanvasElement.getContext('2d')

  this.XAxis
  this.DrawPictureOptDialog = new DrawPictureOptDialog()
  this.GoToDialog = new GoToDialog()

  this.DataOffSet             // 当前数据偏移量：右游标
  this.Mode                   // 模式：0 离线、1 在线（实时获取数据）
  this.IsLoadData = false     //判断是否加载数据中，如果是则不允许任何图表触摸操作
  this.Drag = false           // 是否按住鼠标
  let drag = {
    click: {

    },
    lastMove: {

    }
  }
  this.DrawPictureIndex = {
    CurSelectIndex: null,      // 当前 select 的绘图对象下标
    CurHoverIndex: null,       // 当前 hover 的绘图对象下标
    CurSelectPoint: null       // 当前 select 绘图对象的point 的下标
  }
  this.Status = 0             //  0光标模式、1数据拖动、2画图工具
  this.Period = "1m"          // 当前周期；周期是全局的，所以进行统一控制
  this.Symbol                 // 标的物

  this.KLinesUrl = g_GoTopChartResource.Domain + '/api/v3/klines'   //请求K线数据
  this.KLineStreams = 'wss://stream.binance.com:9443/'              //实时请求K线数据
  this.IndicatorDataUrl = ""                                        // 自定义指标数据

  var self = this

  this.ClickEventCallBack = function (type) {
    switch (type) {
      case 'delete':
        if (self.DrawPictureIndex.CurSelectIndex != null) {
          if (self.DrawPictureSaveIndex >= self.DrawPictureIndex.CurSelectIndex) {
            // 删除掉持久化数据中的绘图元素，则需将删除的对象保存起来，等待save的时候再一起做处理
            self.DrawPictureToolDeleteList.push(self.DrawPictureToolList[self.DrawPictureIndex.CurSelectIndex])
          }
          self.DrawPictureToolList.splice(self.DrawPictureIndex.CurSelectIndex, 1)
          self.DrawPictureIndex.CurSelectIndex = null
          self.DrawPictureIndex.CurHoverIndex = null
          self.DrawPictureIndex.CurSelectPoint != null && (self.DrawPictureIndex.CurSelectPoint = null)
          self.DrawPictureOptDialog.SetHide()
        }
        break;
      case 'goto':
        var date = $('#date-d').val()
        var time = $('#time-d').val()
        var datetime = date + ' ' + time
        datetime = date2TimeStamp(datetime)
        if (datetime === '') return
        var length = ChartData.getInstance().PeriodData[self.Period].Data.length
        if (datetime <= ChartData.getInstance().PeriodData[self.Period].Data[length - 1].datetime
          && datetime >= ChartData.getInstance().PeriodData[self.Period].Data[0].datetime) {
          var dataOffset = self.CalculationGoToKIndex(datetime)
          if (dataOffset - ChartSize.getInstance().ScreenKNum < 0) {
            // 跳转的游标使得第一根K线下标为负数，所以调整游标，这样就不需要去处理获取新数据的问题
            ChartData.getInstance().DataOffSet = ChartSize.getInstance().ScreenKNum - 1
          } else {
            ChartData.getInstance().DataOffSet = parseInt(dataOffset)
          }
          self.ClearMainCanvas()
          self.ClearOptCanvas()
          self.Drag = false
          self.SplitData()
          self.Draw()
          break;
        }

        if (datetime > ChartData.getInstance().PeriodData[self.Period].Data[length - 1].datetime) {
          // 获取新数据
          self.Loading()
          var start = ChartData.getInstance().PeriodData[self.Period].Data[length - 1].datetime
          start = self.CalculationSpacingTimeStamp(start, 1, 'next')
          self.RequestNewData(self.Period, function (res) {  // 请求新数据
            ChartData.getInstance().DataOffSet = ChartData.getInstance().PeriodData[self.Period].Data.length - 1  // 将 DataOffSet 移到最后
            var diffNum = ChartData.getInstance().PeriodData[self.Period].Data.length - ChartData.getInstance().NewData.length
            if (diffNum > 100) {
              ChartData.getInstance().BorrowKLineNum = 100
            } else {
              ChartData.getInstance().BorrowKLineNum = diffNum
            }
            var leftIndex = diffNum - ChartData.getInstance().BorrowKLineNum
            self.LoadIndicatorData(ChartData.getInstance().PeriodData[self.Period].Data.slice(leftIndex, -1), 'new')
            self.Loaded()
            self.Drag = false
            self.SplitData()
            self.Draw()
          }, start, datetime)
        } else if (datetime < ChartData.getInstance().PeriodData[self.Period].Data[0].datetime) {
          // 获取新的历史数据
          self.Loading()
          var end = ChartData.getInstance().PeriodData[self.Period].Data[0].datetime
          end = self.CalculationSpacingTimeStamp(end, 1, 'last')
          self.RequestHistoryData(self.Period, function (res) {  // 请求历史数据
            ChartData.getInstance().DataOffSet = ChartSize.getInstance().ScreenKNum() - 1
            var diffNum = ChartData.getInstance().PeriodData[self.Period].Data.length - ChartData.getInstance().NewData.length
            if (diffNum > 100) {
              ChartData.getInstance().BorrowKLineNum = 100
            } else {
              ChartData.getInstance().BorrowKLineNum = diffNum
            }
            self.LoadIndicatorData(ChartData.getInstance().PeriodData[self.Period].Data.slice(0, ChartData.getInstance().NewData.length + ChartData.getInstance().BorrowKLineNum), 'history')
            // self.UpdateDrawPicturePointIndex()  // 更新绘图对象
            self.Loaded()
            self.Drag = false
            self.SplitData()
            self.Draw()
          }, datetime, end)
        }
        break;
      case 'goto-close':
        self.GoToDialog.SetHide()
        break;
    }
  }

  this.CreateElement = function () {
    // 加载loading element
    this.LoadElement = document.createElement('div')
    this.LoadElement.className = "load-ele"
    this.LoadElement.id = "load-ele"
    this.LoadElement.style.display = "none"
    var span = document.createElement('span')
    span.className = "iconfont icon-jiazai load-icon animationSlow"
    span.style.fontSize = "50px"

    this.LoadElement.appendChild(span)
    this.ChartElement.appendChild(this.LoadElement)
    this.ChartElement.appendChild(this.CanvasElement)
    this.ChartElement.appendChild(this.OptCanvasElement)
    this.ChartElement.appendChild(this.DrawPictureOptDialog.Create())
    this.ChartElement.appendChild(this.GoToDialog.Create())
    this.GoToDialog.RegisterClickEvent(this.ClickEventCallBack)
    this.DrawPictureOptDialog.RegisterClickEvent(this.ClickEventCallBack)
  }

  this.Resize = function () {
    this.SetSize()

    this.XOption.height = ChartSize.getInstance().XAxisHeight
    this.XOption.width = ChartSize.getInstance().ChartContentWidth - ChartSize.getInstance().YAxisWidth
    this.XOption.position.left = 0
    this.XOption.position.top = ChartSize.getInstance().ChartContentHeight - ChartSize.getInstance().XAxisHeight

    const ch = ChartSize.getInstance().ChartContentHeight - ChartSize.getInstance().XAxisHeight
    const cw = ChartSize.getInstance().ChartContentWidth - ChartSize.getInstance().YAxisWidth

    var wn = 0
    for (let w in this.Options.Window) {
      if (this.Options.Window[w].Location === 'pair') {
        wn++
      }
    }
    const sch = ch / (wn + ChartSize.getInstance().ChartScale)

    var ict = ChartSize.getInstance().ChartScale * sch
    for (let i in this.ChartFramePaintingList) {
      this.ChartFramePaintingList[i].ChartElement = this.ChartElement
      this.ChartFramePaintingList[i].Resize()
      if (this.ChartFramePaintingList[i].Name === "kLine") {
        this.KLineOption.width = cw
        this.KLineOption.height = ChartSize.getInstance().ChartScale * sch
        this.KLineOption.yAxis.width = ChartSize.getInstance().YAxisWidth
        this.KLineOption.yAxis.height = this.KLineOption.height
        this.KLineOption.yAxis.position.left = cw
        this.ChartFramePaintingList[i].Option = this.KLineOption
      } else {
        this.ChartFramePaintingList[i].Option.width = cw
        this.ChartFramePaintingList[i].Option.height = sch
        this.ChartFramePaintingList[i].Option.position.top = ict
        this.ChartFramePaintingList[i].Option.yAxis.height = sch
        this.ChartFramePaintingList[i].Option.yAxis.position.left = cw
        this.ChartFramePaintingList[i].Option.yAxis.position.top = ict
        ict += sch
      }
    }


  }

  this.SetSize = function () {
    const width = ChartSize.getInstance().ChartContentWidth
    const height = ChartSize.getInstance().ChartContentHeight

    this.ChartElement.style.height = height + 'px'
    this.ChartElement.style.width = width + 'px'
    this.LoadElement.style.height = height + 'px'
    this.LoadElement.style.width = width + 'px'
    if (this.CanvasElement && this.OptCanvasElement) {
      this.CanvasElement.style.width = width + 'px'
      this.CanvasElement.style.height = height + 'px'
      this.CanvasElement.width = width * pixelTatio
      this.CanvasElement.height = height * pixelTatio

      this.OptCanvasElement.style.width = width + 'px'
      this.OptCanvasElement.style.height = height + 'px'
      this.OptCanvasElement.width = width * pixelTatio
      this.OptCanvasElement.height = height * pixelTatio
    } else {
      throw "CanvasElement or OptCanvasElement is undefined"
    }
  }

  this.SetFrameOption = function () {
    // period
    this.Period = this.Options.KLine.Period
    // mode
    this.Mode = this.Options.Mode
    //symbol
    this.Symbol = this.Options.Symbol
    // xAxis
    this.XOption.height = ChartSize.getInstance().XAxisHeight
    this.XOption.width = ChartSize.getInstance().ChartContentWidth - ChartSize.getInstance().YAxisWidth
    this.XOption.position = {}
    this.XOption.position.left = 0
    this.XOption.position.top = ChartSize.getInstance().ChartContentHeight - ChartSize.getInstance().XAxisHeight

    var wn = 0
    for (let w in this.Options.Window) {
      if (this.Options.Window[w].Location === 'pair') {
        wn++
      }
    }
    const ch = ChartSize.getInstance().ChartContentHeight - ChartSize.getInstance().XAxisHeight
    const cw = ChartSize.getInstance().ChartContentWidth - ChartSize.getInstance().YAxisWidth
    const sch = ch / (wn + ChartSize.getInstance().ChartScale)
    // kline
    this.KLineOption.name = 'kLine'
    this.KLineOption.symbol = this.Options.Symbol
    this.KLineOption.width = cw
    this.KLineOption.height = ChartSize.getInstance().ChartScale * sch
    this.KLineOption.position = {
      left: 0,
      top: 0
    }
    this.KLineOption.yAxis = {
      width: ChartSize.getInstance().YAxisWidth,
      height: this.KLineOption.height,
      name: 'kLine',
      position: {
        left: cw,
        top: 0
      }
    }
    this.FrameList.push(this.KLineOption)
    // indicators
    var ict = this.KLineOption.height
    for (var i in this.Options.Window) {
      var option = {
        name: this.Options.Window[i].Index,
        type: this.Options.Window[i].Type,
        requestType: this.Options.Window[i].RequestType,
        dataType: this.Options.Window[i].DataType,
        precision: this.Options.Window[i].Precision,
        location: this.Options.Window[i].Location,
        params: this.Options.Window[i].Params,
        key: this.Options.Window[i].Key,
        plots: this.Options.Window[i].Plots,
        style: this.Options.Window[i].Style,
        width: cw,
        height: sch,
        position: {
          left: 0,
          top: ict
        },
        yAxis: {
          width: ChartSize.getInstance().YAxisWidth,
          height: sch,
          type: this.Options.Window[i].Type,
          name: this.Options.Window[i].Index,
          key: this.Options.Window[i].Key,
          position: {
            left: cw,
            top: ict
          }
        }
      }
      this.FrameList.push(option)
      var indicatorData = new IndicatorData()
      indicatorData.RequestType = option.requestType
      indicatorData.DataType = option.dataType
      this.IndicatorDataList[option.name] = indicatorData
      ict += sch
    }
  }

  this.SetChartFrameList = function () {
    for (var i in this.FrameList) {
      if (this.FrameList[i].location !== 'main') {

        var chartFramePaint = new ChartFramePainting()
        chartFramePaint.Name = this.FrameList[i].name
        chartFramePaint.Option = this.FrameList[i]
        chartFramePaint.ChartElement = this.ChartElement
        this.ChartFramePaintingList.push(chartFramePaint)

        if (this.FrameList[i].name === 'kLine') {
          this.KLineChartFrameIndex = this.ChartFramePaintingList.length - 1
        }
      } else {
        // 处理主图 indicator 
        this.ChartFramePaintingList[this.KLineChartFrameIndex].IndicatorList[this.FrameList[i].name] = this.FrameList[i]
      }
    }
  }

  this.Draw = function () {
    // 光标
    this.CrossCursor.Create(this.Canvas, this.OptCanvas, this.ChartFramePaintingList, this.XOption)
    // xAxis
    var xAxis = new XAxis()
    xAxis.Create(this.Canvas, this.OptCanvas, this.XOption)
    this.XAxis = xAxis
    // window
    for (let i in this.ChartFramePaintingList) {
      switch (this.ChartFramePaintingList[i].Name) {
        // K线图
        case 'kLine':
          this.DrawKLineChart(i)
          break;
        // 系统指标
        case 'MACD':
          this.DrawMacdChart(i)
          break;
        // 自定义指标 
        default:
          if (this.ChartFramePaintingList[i].Option.type === 'custom') {
            this.DrawCustomIndicator(i)
          }
          break;
      }
    }
    // 更新 title value
    this.UpdateTitleCurValue(ChartData.getInstance().Data.length - 1)
    // 更新 画图
    console.log("开始画图")
    for (let i in this.DrawPictureToolList) {
      this.DrawPictureToolList[i].Canvas && this.DrawPictureToolList[i].Draw(null, null)
    }

  }

  this.CreateDrawPictureTool = function (id) {
    if (this.Status != 2) {
      this.Status = 2
    } else {
      this.Status = 0
      return
    }

    switch (id) {
      case "cursor-tool":
        this.Status = 0
        break;
      case "line-tool":
        var obj = new LineElement()
        obj.Name = 'line'
        obj.IsSelect = true
        this.DrawPictureToolList.push(obj)
        break;
      case "rect-tool":
        var obj = new RectElement()
        obj.IsSelect = true
        obj.Name = 'rect'
        this.DrawPictureToolList.push(obj)
        break;
      case "buy-tool":
        var obj = new SignalsElement()
        obj.IsSelect = true
        obj.Name = 'signals'
        obj.ExtensionObj.type = "buy"
        this.DrawPictureToolList.push(obj)
        break;
      case "sell-tool":
        var obj = new SignalsElement()
        obj.IsSelect = true
        obj.Name = 'signals'
        obj.ExtensionObj.type = "sell"
        this.DrawPictureToolList.push(obj)
        break;
    }
  }

  this.OptCanvasElement.onmousemove = function (e) {
    if (self.IsLoadData || !self.DrawPictureOptDialog.IsHide) {
      return
    }
    var obj = self.GetFixOffSetYX(e.clientX, e.clientY)   // 计算出当前鼠标在 画布中的 x 和 y

    // 判断是否在 Chart 可绘制区域内
    if (obj.x > ChartSize.getInstance().GetLeft()
      && obj.x < ChartSize.getInstance().GetLeft() + ChartData.getInstance().Data.length * ChartSize.getInstance().GetKLineWidth()
      && obj.y < ChartSize.getInstance().ChartContentHeight - ChartSize.getInstance().XAxisHeight
      && obj.y > ChartSize.getInstance().GetTop() + ChartSize.getInstance().GetTitleHeight()
    ) {
      self.ClearOptCanvas()

      if (self.Status == 0 && self.Drag == false) {
        // 光标移动
        var kIndex = self.CrossCursor.Move(obj.x * pixelTatio, obj.y * pixelTatio)
        // 更新 title 值
        self.UpdateTitleCurValue(kIndex)
        // 判断之前是否有hover画图对象，有的话要进行重置
        if (self.DrawPictureIndex.CurHoverIndex != null) {
          self.DrawPictureToolList[self.DrawPictureIndex.CurHoverIndex].IsHover = false
          self.DrawPictureIndex.CurHoverIndex = null
        }
        // 判断当前光标位置是否有hover的画图对象
        var isPointInPath = -1
        for (let d in self.DrawPictureToolList) {
          isPointInPath = self.DrawPictureToolList[d].IsPointInPath(obj.x, obj.y)
          if (isPointInPath == -1) {
            continue
          }
          self.DrawPictureIndex.CurHoverIndex = d
          self.DrawPictureToolList[d].IsHover = true
          break
        }
      }
      // 数据拖动
      if (self.Status == 0 && self.Drag == true && self.DrawPictureIndex.CurSelectIndex == null) {
        self.ClearMainCanvas()
        var moveStep = Math.abs(drag.lastMove.X - obj.x)
        var isLeft = true
        if (drag.lastMove.X < obj.x) isLeft = false
        self.MoveData(moveStep, isLeft)
        drag.lastMove.X = obj.x
        drag.lastMove.Y = obj.y
      }

      // 画图工具 整体拖动
      if (self.DrawPictureIndex.CurSelectIndex != null && self.DrawPictureIndex.CurSelectPoint == null && self.Drag) {
        console.log("画图工具 整体拖动")
        var moveY = obj.y - drag.lastMove.Y
        var lastIndex = Math.ceil(drag.lastMove.X / (ZOOM_SEED[ChartSize.getInstance().CurScaleIndex][1] + ZOOM_SEED[ChartSize.getInstance().CurScaleIndex][0]))
        var offsetIndex = Math.ceil(obj.x / (ZOOM_SEED[ChartSize.getInstance().CurScaleIndex][1] + ZOOM_SEED[ChartSize.getInstance().CurScaleIndex][0]))
        for (var i in self.DrawPictureToolList[self.DrawPictureIndex.CurSelectIndex].Position) {
          self.DrawPictureToolList[self.DrawPictureIndex.CurSelectIndex].UpdatePoint(i, offsetIndex - lastIndex, moveY)
        }
        drag.lastMove.X = obj.x
        drag.lastMove.Y = obj.y
      }

      // 画图工具 某个点进行改动
      if (self.DrawPictureIndex.CurSelectIndex != null && self.DrawPictureIndex.CurSelectPoint != null && self.Drag) {
        console.log("画图工具 某个点进行改动")
        let moveY = obj.y - drag.lastMove.Y
        var lastIndex = Math.ceil(drag.lastMove.X / (ZOOM_SEED[ChartSize.getInstance().CurScaleIndex][1] + ZOOM_SEED[ChartSize.getInstance().CurScaleIndex][0]))
        var offsetIndex = Math.ceil(obj.x / (ZOOM_SEED[ChartSize.getInstance().CurScaleIndex][1] + ZOOM_SEED[ChartSize.getInstance().CurScaleIndex][0]))
        self.DrawPictureToolList[self.DrawPictureIndex.CurSelectIndex].UpdatePoint(self.DrawPictureIndex.CurSelectPoint, offsetIndex - lastIndex, moveY)
        drag.lastMove.X = obj.x
        drag.lastMove.Y = obj.y
      }
      for (let i in self.DrawPictureToolList) {
        self.DrawPictureToolList[i].Canvas && self.DrawPictureToolList[i].Draw(obj.x, obj.y)
      }
    }
  }

  this.OptCanvasElement.onmousedown = function (e) {
    if (self.IsLoadData) return // 数据加载中，不执行点击逻辑

    var obj = self.GetFixOffSetYX(e.clientX, e.clientY)   // 计算出当前鼠标在 画布中的 x 和 y

    // 判断是否点击在 drawToolObjOpt 区域 内
    if (!self.DrawPictureOptDialog.isHide
      && obj.x >= self.DrawPictureOptDialog.GetPosition().x
      && obj.x <= self.DrawPictureOptDialog.GetPosition().x + ChartSize.getInstance().DrawPictureOptDialogWidth
      && obj.y >= self.DrawPictureOptDialog.GetPosition().y
      && obj.y <= self.DrawPictureOptDialog.GetPosition().y + self.DrawPictureOptDialog.GetHeight()) {
      return
    }

    // 如果 drawToolObjOpt 显示状态，点击则进行隐藏
    if (!self.DrawPictureOptDialog.isHide) {
      self.DrawPictureOptDialog.SetHide()
    }

    // 判断是否在 Chart 可绘制区域内
    if (obj.x > ChartSize.getInstance().GetLeft()
      && obj.x < ChartSize.getInstance().GetLeft() + ChartData.getInstance().Data.length * ChartSize.getInstance().GetKLineWidth()
      && obj.y < ChartSize.getInstance().ChartContentHeight - ChartSize.getInstance().XAxisHeight
      && obj.y > ChartSize.getInstance().GetTop() + ChartSize.getInstance().GetTitleHeight()
    ) {

      drag.click.X = obj.x
      drag.click.Y = obj.y
      drag.lastMove.X = obj.x
      drag.lastMove.Y = obj.y
      self.Drag = true

      // 画图模式
      if (self.Status === 2) {
        // 判断 画图对象 是否已经初始化完成
        if (!self.DrawPictureToolList[self.DrawPictureToolList.length - 1].Canvas) {
          var option = null
          // 判断之前是否有选中某个画图对象，有的话要重置
          if (self.DrawPictureIndex.CurSelectIndex != null) {
            self.DrawPictureToolList[self.DrawPictureIndex.CurSelectIndex].IsSelect = false
          }
          // 初始化 CurSelectPoint
          if (self.DrawPictureIndex.CurSelectPoint != null) {
            self.DrawPictureIndex.CurSelectPoint = null
          }
          self.DrawPictureIndex.CurSelectIndex = self.DrawPictureToolList.length - 1
          // 遍历当前点击的位置在画布的哪个位置，初始化option
          for (var j in self.ChartFramePaintingList) {
            var o = self.ChartFramePaintingList[j].Option
            if (obj.y > o.position.top + ChartSize.getInstance().GetTop() + ChartSize.getInstance().GetTitleHeight() && obj.y < o.position.top + o.height - ChartSize.getInstance().GetBottom()) {
              option = o
            }
          }
          if (!option) {
            // 找不到对应的ChartFrame，清除掉保存的DrawPictureToolList
            self.DrawPictureToolList.splice(self.DrawPictureIndex.CurSelectIndex, 1)
            self.DrawPictureIndex.CurSelectIndex = null
            return
          }
          self.DrawPictureToolList[self.DrawPictureIndex.CurSelectIndex].Create(self.OptCanvas, option)
        }
        // 判断当前画图对象 创建 的点数是否满足要求，满足则说明画图对象已经绘制完成
        if (self.DrawPictureToolList[self.DrawPictureIndex.CurSelectIndex].Position.length
          < self.DrawPictureToolList[self.DrawPictureIndex.CurSelectIndex].PointCount) {
          self.DrawPictureToolList[self.DrawPictureIndex.CurSelectIndex].SetPoint(obj.x, obj.y)
        }
        console.log(self.DrawPictureToolList)
        return
      }
      // 光标模式
      if (self.Status === 0) {
        // 判断之前是否有选中某个画图对象，有的话要重置
        if (self.DrawPictureIndex.CurSelectIndex != null) {
          self.DrawPictureToolList[self.DrawPictureIndex.CurSelectIndex].IsSelect = false
          self.DrawPictureIndex.CurSelectIndex = null
        }
        // 初始化 CurSelectPoint
        if (self.DrawPictureIndex.CurSelectPoint != null) {
          self.DrawPictureIndex.CurSelectPoint = null
        }
        var inPath = -1
        for (var d in self.DrawPictureToolList) {
          inPath = self.DrawPictureToolList[d].IsPointInPath(obj.x, obj.y)

          if (inPath == -1 || inPath == undefined) {  // 没有选中
            self.DrawPictureIndex.CurSelectIndex = null
            self.DrawPictureIndex.CurSelectPoint = null
            continue
          }
          if (inPath != 100) {                   // 选中了Point
            self.DrawPictureToolList[d].IsSelect = true
            self.DrawPictureIndex.CurSelectIndex = d
            self.DrawPictureIndex.CurSelectPoint = inPath
            break
          }
          if (inPath == 100) {                  // 选中了路径
            self.DrawPictureToolList[d].IsSelect = true
            self.DrawPictureIndex.CurSelectIndex = d
            self.DrawPictureIndex.CurSelectPoint = null
            break
          }
        }
      }
    }
  }

  this.OptCanvasElement.onmouseup = function (e) {
    if (!e) e = window.event
    var obj = self.GetFixOffSetYX(e.clientX, e.clientY)
    self.Drag = false
    if (e.button == 2) {
      // 右键，如果有选中画图对象的话，弹窗操作窗口
      if (self.DrawPictureIndex.CurSelectIndex != null) {
        self.DrawPictureOptDialog.SetPosition(obj.x, obj.y)
        self.DrawPictureOptDialog.SetShow()
      }
    }

    if (self.Status == 2) {
      if (self.DrawPictureToolList[self.DrawPictureIndex.CurSelectIndex].Position.length
        < self.DrawPictureToolList[self.DrawPictureIndex.CurSelectIndex].PointCount) {
        // 画图未完成
        return
      } else if (self.DrawPictureToolList[self.DrawPictureIndex.CurSelectIndex].Position.length
        === self.DrawPictureToolList[self.DrawPictureIndex.CurSelectIndex].PointCount) {
        // 画图完成
        self.DrawPictureToolList[self.DrawPictureIndex.CurSelectIndex].IsFinished = true
        self.Status = 0
      }
    }
  }

  this.OptCanvasElement.onmousewheel = function (e) {
    if (self.IsLoadData || !self.DrawPictureOptDialog.IsHide) {
      return
    }
    self.ScaleKLine(e.wheelDelta) // 缩放K线大小
    self.ClearMainCanvas()  // 清空画布
    self.ClearOptCanvas()
    var leftDatasIndex = ChartData.getInstance().DataOffSet + 1 - ChartSize.getInstance().ScreenKNum()
    if (leftDatasIndex < 0) {
      var time = self.CalculationRequestTimeRange('history')  // 计算start 和 end
      self.RequestHistoryData(self.Period, function (res) {
        var diffNum = ChartData.getInstance().PeriodData[self.Period].Data.length - ChartData.getInstance().NewData.length
        if (diffNum > 100) {
          ChartData.getInstance().BorrowKLineNum = 100
        } else {
          ChartData.getInstance().BorrowKLineNum = diffNum
        }
        self.LoadIndicatorData(ChartData.getInstance().PeriodData[self.Period].Data.slice(0, ChartData.getInstance().NewData.length + ChartData.getInstance().BorrowKLineNum), 'history')
        // self.UpdateDrawPicturePointIndex()  // 更新绘图对象
        self.Loaded()
        self.SplitData()
        self.Draw()
      }, time.start, time.end)
    } else {
      self.SplitData()
      self.Draw()
    }
  }

  this.OptCanvasElement.oncontextmenu = function (e) {
    e.preventDefault()
  }

  this.GetFixOffSetYX = function (clientX, clientY) {
    var obj = {}
    obj.x = clientX - ChartSize.getInstance().ChartOffSetLeft - ChartSize.getInstance().LeftToolWidthPx - g_GoTopChartResource.BorderWidth[0]
    obj.y = clientY - ChartSize.getInstance().ChartOffSetTop - ChartSize.getInstance().TopToolHeightPx - g_GoTopChartResource.BorderWidth[0]
    return obj
  }

  this.RequestHistoryData = function (period, callback, start, end) {
    if (start == null && end == null) return
    this.Loading()
    // 判断数据是否存在，不存在则调用接口获取
    if (ChartData.getInstance().PeriodData[period]
      && ChartData.getInstance().PeriodData[period].Data.length > 0
      && end >= ChartData.getInstance().GetStartTimeOfPeriodData(this.Period)
      && end <= ChartData.getInstance().GetEndTimeOfPeriodData(this.Period)) {

      if (start
        && start >= ChartData.getInstance().GetStartTimeOfPeriodData(this.Period)
        && start <= ChartData.getInstance().GetEndTimeOfPeriodData(this.Period)) {
        // start 和 end 都存在已有的数据集中
        callback()
        return
      } else {
        // start 存在 已有数据集中，end 不存在以有数据集中
        end = ChartData.getInstance().GetStartTimeOfPeriodData(this.Period)
      }
    }
    JSNetwork.HttpRequest({
      url: this.KLinesUrl,
      headers: {
        // "X-MBX-APIKEY": "gIu5ec7EO6ziqUIyL6btfVSpHVvU77J17p9gQpkMexBL6FI94HBukLRhvB51a2Wz"
      },
      data: {
        "symbol": this.Symbol,
        "interval": this.Period,
        "limit": ChartData.getInstance().Limit,
        "startTime": start,
        "endTime": end
      },
      type: "get",
      dataType: "json",
      async: true,
      success: function (data) {
        self.ProcessHistoryData(data, period, callback)
      }
    })
  }

  this.RequestNewData = function (period, callback, start, end) {
    this.Loading()
    // 判断数据是否存在，不存在则调用接口获取
    if (ChartData.getInstance().PeriodData[period]
      && ChartData.getInstance().PeriodData[period].Data.length > 0
      && start >= ChartData.getInstance().GetStartTimeOfPeriodData(this.Period)
      && start <= ChartData.getInstance().GetEndTimeOfPeriodData(this.Period)) {

      if (end
        && end >= ChartData.getInstance().GetStartTimeOfPeriodData(this.Period)
        && end <= ChartData.getInstance().GetEndTimeOfPeriodData(this.Period)) {
        // start 和 end 都存在已有的数据集中
        callback()
        return
      } else {
        // start 存在 已有数据集中，end 不存在以有数据集中
        start = ChartData.getInstance().GetEndTimeOfPeriodData(this.Period)
      }
    }

    var params = {
      "symbol": this.Symbol,
      "interval": this.Period,
      "limit": ChartData.getInstance().Limit,
    }
    if (start) {
      params.startTime = start
    }

    JSNetwork.HttpRequest({
      url: this.KLinesUrl,
      headers: {
        // "X-MBX-APIKEY": "gIu5ec7EO6ziqUIyL6btfVSpHVvU77J17p9gQpkMexBL6FI94HBukLRhvB51a2Wz"
      },
      data: params,
      type: "get",
      dataType: "json",
      async: true,
      success: function (res) {
        self.ProcessNewData(res, period, callback)
      }
    })
  }

  this.RequestRealTimeData = function () {
    var p = {
      "method": "SUBSCRIBE",
      "params":
        [
          this.Symbol.toLowerCase() + "@kline_" + this.Period,
        ],
      "id": 1
    }
    if (!this.JSWebSocket) {
      this.JSWebSocket = new JSWebSocket(this.KLineStreams + 'ws/' + this.Symbol + '@kline_' + this.Period, this.ProcessRealTimeData, JSON.stringify(p), "klineStream")
    }
    this.JSWebSocket.connect()
  }

  this.ProcessRealTimeData = function (res) {
    res = JSON.parse(res)
    if (!res.e) return
    var dataObj = new DataObj()
    dataObj.datetime = res.k.t
    dataObj.closetime = res.k.T
    dataObj.open = res.k.o
    dataObj.close = res.k.c
    dataObj.high = res.k.h
    dataObj.low = res.k.l
    dataObj.volume = res.k.v
    if (ChartData.getInstance().PeriodData[self.Period].Data[ChartData.getInstance().PeriodData[self.Period].Data.length - 1].datetime == dataObj.datetime) {
      ChartData.getInstance().PeriodData[self.Period].Data[ChartData.getInstance().PeriodData[self.Period].Data.length - 1] = dataObj
    } else {
      ChartData.getInstance().DataOffSet++
      ChartData.getInstance().PeriodData[self.Period].Data.push(dataObj)
    }
    var length = ChartData.getInstance().PeriodData[self.Period].Data.length
    if (length > 100) {
      ChartData.getInstance().BorrowKLineNum = 100
    } else {
      ChartData.getInstance().BorrowKLineNum = length - 1 // 减掉websocket最新的一根K线
    }
    self.ClearMainCanvas()
    self.ClearOptCanvas()
    var leftIndex = ChartData.getInstance().PeriodData[self.Period].Data.length - ChartData.getInstance().BorrowKLineNum - 1
    self.LoadIndicatorData(ChartData.getInstance().PeriodData[self.Period].Data.slice(leftIndex, ChartData.getInstance().PeriodData[self.Period].Data.length), 'new')
    self.SplitData()
    self.Loaded()
    self.Draw()
  }

  this.ProcessHistoryData = function (data, period, callback) {
    // 判断是否已有加载的数据
    var isExist = false
    if (ChartData.getInstance().PeriodData[period] && ChartData.getInstance().PeriodData[period].Data.length > 0) {
      isExist = true
    } else {
      ChartData.getInstance().PeriodData[period] = {}
      ChartData.getInstance().PeriodData[period].Data = new Array()
    }
    // 对数据进行处理
    var newData = new Array()
    for (let i in data) {
      var dataItem = new DataObj()
      dataItem['datetime'] = data[i][0]
      dataItem['open'] = data[i][1]
      dataItem['high'] = data[i][2]
      dataItem['low'] = data[i][3]
      dataItem['close'] = data[i][4]
      dataItem['volume'] = data[i][5]
      dataItem['closetime'] = data[i][6]

      newData.push(dataItem)
    }
    ChartData.getInstance().NewData = newData
    ChartData.getInstance().DataOffSet += newData.length    // 根据具体获取多少条，来改变数据偏移量
    if (isExist) {
      newData = newData.concat(ChartData.getInstance().PeriodData[period].Data)
    }
    ChartData.getInstance().PeriodData[period].Data = newData
    callback()
  }

  this.ProcessNewData = function (data, period, callback) {
    // 判断是否已有加载的数据
    var isExist = false
    if (ChartData.getInstance().PeriodData[period] && ChartData.getInstance().PeriodData[period].Data.length > 0) {
      isExist = true
    } else {
      ChartData.getInstance().PeriodData[period] = {}
      ChartData.getInstance().PeriodData[period].Data = new Array()
    }
    var newData = new Array()
    // 对数据进行处理
    for (let i in data) {
      var dataItem = new DataObj()
      dataItem['datetime'] = data[i][0]
      dataItem['open'] = data[i][1]
      dataItem['high'] = data[i][2]
      dataItem['low'] = data[i][3]
      dataItem['close'] = data[i][4]
      dataItem['volume'] = data[i][5]
      dataItem['closetime'] = data[i][6]

      newData.push(dataItem)
      ChartData.getInstance().PeriodData[period].Data.push(dataItem)
    }
    ChartData.getInstance().NewData = newData
    // 数据加载完成 执行回调
    callback()
  }

  /**
   * 获取指标数据
   * 1. 新增指标窗口：data 取自 ChartData.GetCurPeriodData()
   * 2. 更新指标数据: data 取自最新请求的K线数据 + 向前推移100跟K线数据（为了使前后两次的指标计算结果平滑衔接）
   */
  this.LoadIndicatorData = function (data, type) {
    if (type == 'new') {
      for (let i in this.IndicatorDataList) {
        if (this.IndicatorDataList[i]                                // 该指标是否有存在 
          && this.IndicatorDataList[i].PeriodData[this.Period]       // 是否存在对应的周期对象
          && this.IndicatorDataList[i].PeriodData[this.Period].Data  // 是否存在对应的周期指标数据
        ) {
          // 方式2
          this.RequestNewIndicatorData(i, data, true)
        } else {
          // 方式1
          this.IndicatorDataList[i].PeriodData[this.Period] = {}
          this.IndicatorDataList[i].PeriodData[this.Period].Data = new Array()
          this.RequestNewIndicatorData(i, data, false)
        }
      }
    } else if (type == 'history') {
      for (let i in this.IndicatorDataList) {
        if (this.IndicatorDataList[i]                                // 该指标是否有存在 
          && this.IndicatorDataList[i].PeriodData[this.Period]       // 是否存在对应的周期对象
          && this.IndicatorDataList[i].PeriodData[this.Period].Data  // 是否存在对应的周期指标数据
        ) {
          // 方式2
          this.RequestHistoryIndicatorData(i, data, true)
        } else {
          // 方式1
          this.IndicatorDataList[i].PeriodData[this.Period] = {}
          this.IndicatorDataList[i].PeriodData[this.Period].Data = new Array()
          this.RequestHistoryIndicatorData(i, data, false)
        }
      }
    }
  }

  this.RequestNewIndicatorData = function (indicator, data, isExist) {
    if (this.IndicatorDataList[indicator].RequestType === 'local') {
      // 本地计算系统 指标数据
      var iData = this.CalculationIndicator(indicator, data)
      this.ProcessIndicatorNewData(indicator, iData, isExist)
    } else if (this.IndicatorDataList[indicator].RequestType === 'network') {
      // 在线请求 自定义指标数据
      if (!isExist) {
        var iData = chanData
        self.ProcessIndicatorNewDiscontinuousData(indicator, iData, isExist)
      }
      // JSNetwork.HttpRequest({
      //   url: IndicatorDataUrl,
      //   headers: {},
      //   data,
      //   type: 'get',
      //   dataType: "json",
      //   async: true,
      //   success: function (res) {
      //     self.ProcessIndicatorNewDiscontinuousData(indicator, data, isExist)
      //   }
      // })
    }

  }

  this.ProcessIndicatorNewDiscontinuousData = function (indicator, data, isExist) {
    if (isExist) {
      this.IndicatorDataList[indicator].PeriodData[this.Period].Data = this.IndicatorDataList[indicator].PeriodData[this.Period].Data.concat(data)
    } else {
      this.IndicatorDataList[indicator].PeriodData[this.Period].Data = data
    }
  }

  this.ProcessIndicatorNewData = function (indicator, data, isExist) {
    if (isExist) {
      data = data.slice(ChartData.getInstance().BorrowKLineNum, data.length)
      if (this.IndicatorDataList[indicator].PeriodData[this.Period].Data[this.IndicatorDataList[indicator].PeriodData[this.Period].Data.length - 1].xIndex == data[data.length - 1].xIndex) {
        this.IndicatorDataList[indicator].PeriodData[this.Period].Data[this.IndicatorDataList[indicator].PeriodData[this.Period].Data.length - 1] = data[data.length - 1]
      } else {
        this.IndicatorDataList[indicator].PeriodData[this.Period].Data = this.IndicatorDataList[indicator].PeriodData[this.Period].Data.concat(data)
      }
    } else {
      this.IndicatorDataList[indicator].PeriodData[this.Period].Data = data
    }
  }

  this.RequestHistoryIndicatorData = function (indicator, data, isExist) {
    if (this.IndicatorDataList[indicator].RequestType === 'local') {
      // 本地计算系统 指标数据
      var iData = this.CalculationIndicator(indicator, data)
      this.ProcessIndicatorHistoryData(indicator, iData, isExist)
    } else if (this.IndicatorDataList[indicator].RequestType === 'network') {

    }
  }

  this.ProcessIndicatorHistoryData = function (indicator, data, isExist) {
    if (isExist) {
      // 向后借的100根K线数据对应的指标 需要替换成最新的，因为指标的计算呈现周期性，会被前面一定周期的K线数据影响，而前面的K线数据更新的话，先前最开始的一部分指标数据势必就是用不了
      this.IndicatorDataList[indicator].PeriodData[this.Period].Data.splice(0, ChartData.getInstance().BorrowKLineNum)
      this.IndicatorDataList[indicator].PeriodData[this.Period].Data = data.concat(this.IndicatorDataList[indicator].PeriodData[this.Period].Data)
    } else {
      this.IndicatorDataList[indicator].PeriodData[this.Period].Data = data
    }
  }

  this.ProcessIndicatorHistoryDiscontinuousData = function (indicator, data, isExist) {
    if (isExist) {
      this.IndicatorDataList[indicator].PeriodData[this.Period].Data = data.concat(this.IndicatorDataList[indicator].PeriodData[this.Period].Data)
    } else {
      this.IndicatorDataList[indicator].PeriodData[this.Period].Data = data
    }
  }

  this.CalculationIndicator = function (indicatorName, kLineData) {
    var c = hxc3.IndicatorFormula.getClass(indicatorName.toLowerCase());
    var indicator = new c();
    var iDatas = indicator.calculate(kLineData);
    return iDatas
  }

  /**
   * @description 当加载history 数据时，绘图的position保存的Index需要继续更新
   */
  this.UpdateDrawPicturePointIndex = function () {
    // var length = ChartData.getInstance().NewData.length
    // for (var i in this.DrawPictureToolList) {
    //   for (var j in this.DrawPictureToolList[i].Position) {
    //     this.DrawPictureToolList[i].Position[j][0] += length
    //   }
    // }
  }

  this.ScaleKLine = function (e) {
    if (e > 0) {
      // 放大
      if (ChartSize.getInstance().CurScaleIndex <= 0) {
        return false
      }
      ChartSize.getInstance().CurScaleIndex--
    } else {
      // 缩小
      if (ChartSize.getInstance().CurScaleIndex >= ZOOM_SEED.length - 1) {
        return false
      }
      ChartSize.getInstance().CurScaleIndex++
    }
    return true
  }

  this.MoveData = function (step, isLeft) {
    if (isLeft) {
      // 画布向左拖动，游标向右
      ChartData.getInstance().DataOffSet += step
      if (this.Mode === 1) {
        if (ChartData.getInstance().DataOffSet > ChartData.getInstance().PeriodData[this.Period].Data.length - 1) {
          ChartData.getInstance().DataOffSet = ChartData.getInstance().PeriodData[this.Period].Data.length - 1
        }
        this.SplitData()
        this.Draw()
      } else if (this.Mode === 0) {
        if (ChartData.getInstance().DataOffSet > ChartData.getInstance().PeriodData[this.Period].Data.length - 1) {
          ChartData.getInstance().DataOffSet -= step          // 请求新数据，游标不变，所以还原
          var time = this.CalculationRequestTimeRange('new')  // 计算 start 和  end
          this.RequestNewData(this.Period, function (res) {  // 请求新数据
            ChartData.getInstance().DataOffSet += step  // 还原DataOffSet
            var diffNum = ChartData.getInstance().PeriodData[self.Period].Data.length - ChartData.getInstance().NewData.length
            if (diffNum > 100) {
              ChartData.getInstance().BorrowKLineNum = 100
            } else {
              ChartData.getInstance().BorrowKLineNum = diffNum
            }
            var leftIndex = diffNum - ChartData.getInstance().BorrowKLineNum
            self.LoadIndicatorData(ChartData.getInstance().PeriodData[self.Period].Data.slice(leftIndex, -1), 'new')
            self.Loaded()
            self.Drag = false
            self.SplitData()
            self.Draw()
          }, time.start, time.end)
        } else {
          this.SplitData()
          this.Draw()
        }
      }
    } else {
      // 画布向右拖动，游标向左
      var leftDatasIndex = ChartData.getInstance().DataOffSet + 1 - ChartSize.getInstance().ScreenKNum()
      leftDatasIndex -= step
      if (leftDatasIndex <= 0) {
        var time = this.CalculationRequestTimeRange('history')  // 计算start 和 end
        this.RequestHistoryData(this.Period, function (res) {  // 请求历史数据
          var diffNum = ChartData.getInstance().PeriodData[self.Period].Data.length - ChartData.getInstance().NewData.length
          if (diffNum > 100) {
            ChartData.getInstance().BorrowKLineNum = 100
          } else {
            ChartData.getInstance().BorrowKLineNum = diffNum
          }
          self.LoadIndicatorData(ChartData.getInstance().PeriodData[self.Period].Data.slice(0, ChartData.getInstance().NewData.length + ChartData.getInstance().BorrowKLineNum), 'history')
          // self.UpdateDrawPicturePointIndex()  // 更新绘图对象
          self.Loaded()
          self.Drag = false
          self.SplitData()
          self.Draw()
        }, time.start, time.end)
      } else {
        ChartData.getInstance().DataOffSet -= step
        this.SplitData()
        this.Draw()
      }
    }
  }

  // 计算要跳转的K线下标
  this.CalculationGoToKIndex = function (gotime) {
    for (let i in ChartData.getInstance().PeriodData[this.Period].Data) {
      var curTime = ChartData.getInstance().PeriodData[this.Period].Data[i].datetime
      var lastTime = null
      if (i != 0) {
        lastTime = ChartData.getInstance().PeriodData[this.Period].Data[i - 1].datetime
      }
      if (gotime == curTime) {
        return i
      }
      // 适配不同周期时间
      if (lastTime && gotime < curTime && gotime > lastTime) {
        return i - 1
      }
    }
  }

  this.CalculationRequestTimeRange = function (type) {
    var start
    var end
    var unit
    switch (this.Period) {
      case "1m":
        unit = 60000
        break;
      case "5m":
        unit = 300000
        break;
      case "15m":
        unit = 900000
        break;
      case "30m":
        unit = 1800000
        break;
      case "1h":
        unit = 3600000
        break;
      case "1d":
        unit = 86400000
        break;
      default:
        // 1w 1M 1y 时间跨度太大，不用计算
        unit = 0
        break;
    }
    if (type === "new") {
      start = ChartData.getInstance().GetEndTimeOfPeriodData(this.Period) + unit
      end = start + (ChartData.getInstance().Limit - 1) * unit
    } else if (type === "history") {
      end = ChartData.getInstance().GetStartTimeOfPeriodData(this.Period) - unit
      start = end - (ChartData.getInstance().Limit - 1) * unit
    }
    if (unit = 0) {
      start = null
      end = null
    }
    return { "start": start, "end": end }
  }

  this.CalculationSpacingTimeStamp = function (curTime, num, type) {
    var unit = 0
    switch (this.Period) {
      case "1m":
        unit = 60000
        break;
      case "5m":
        unit = 300000
        break;
      case "15m":
        unit = 900000
        break;
      case "30m":
        unit = 1800000
        break;
      case "1h":
        unit = 3600000
        break;
      case "1d":
        unit = 86400000
        break;
      default:
        // 1w 1M 1y 时间跨度太大，不用计算
        unit = 0
        break;
    }
    var time = null
    if (type === 'last') {
      time = curTime - (unit * num)
    } else if (type === 'next') {
      time = curTime + (unit * num)
    }
    return time
  }

  /**
   * @description 画图元件数据处理：从外部获取的绘图对象数据要再进行一次格式化，转换成客户端便于渲染的数据格式
   */
  this.ProcessDrawPictureEleData = function () {
    // $.getJSON("./datas/drawEleDatas.json", res => {
    //   console.log(res)
    // })
    for (let i in this.Options.drawEle) {
      const type = this.Options.drawEle[i].type
      const drawEleDatas = drawEleDatasObj[this.Options.drawEle[i].type][this.Period]
      for (let i in drawEleDatas) {
        // 创建绘图元件对象
        var obj
        switch (type) {
          case "signals":
            obj = new SignalsElement()
            obj.IsSelect = false
            obj.Name = 'signals'
            obj.IsFinished = true
            obj.ExtensionObj.type = drawEleDatas[i].type
            obj.Position.push([parseInt(drawEleDatas[i].begin_time), drawEleDatas[i].value])
            break;
          case "line":
            obj = new LineElement()
            obj.Name = 'line'
            obj.IsSelect = false
            obj.IsFinished = true
            obj.Position.push([parseInt(drawEleDatas[i].begin_time), drawEleDatas[i].value1])
            obj.Position.push([parseInt(drawEleDatas[i].end_time), drawEleDatas[i].value2])
            break;
          case "rect":
            obj = new RectElement()
            obj.Name = 'rect'
            obj.IsSelect = false
            obj.IsFinished = true
            obj.Position.push([parseInt(drawEleDatas[i].begin_time), drawEleDatas[i].value1])
            obj.Position.push([parseInt(drawEleDatas[i].end_time), drawEleDatas[i].value2])
            break;
        }
        // 判断元件在哪个图表，set options
        for (let c in this.ChartFramePaintingList) {
          if (this.ChartFramePaintingList[c].Name == drawEleDatas[i].location) {
            obj.Option = this.ChartFramePaintingList[c].Option
            obj.Canvas = this.OptCanvas
          }
        }
        // 保存文件数据到 drawPictureToolList
        this.DrawPictureToolList.push(obj)
      }
    }
    // 保存saveIndex
    this.DrawPictureSaveIndex = this.DrawPictureToolList.length - 1
  }

  this.SaveDrawPicture = function () {
    let signals = []
    let rect = []
    let line = []
    for (let i in this.DrawPictureToolList) {
      switch (this.DrawPictureToolList[i].Name) {
        case 'line':
          line.push({
            begin_time: this.DrawPictureToolList[i].Position[0][0],
            end_time: this.DrawPictureToolList[i].Position[1][0],
            value1: this.DrawPictureToolList[i].Position[0][1],
            value2: this.DrawPictureToolList[i].Position[1][1]
          })
          break;
        case 'rect':
          rect.push({
            begin_time: this.DrawPictureToolList[i].Position[0][0],
            end_time: this.DrawPictureToolList[i].Position[1][0],
            value1: this.DrawPictureToolList[i].Position[0][1],
            value2: this.DrawPictureToolList[i].Position[1][1]
          })
          break;
        case 'signals':
          signals.push({
            begin_time: this.DrawPictureToolList[i].Position[0][0],
            value: this.DrawPictureToolList[i].Position[0][1],
            type: this.DrawPictureToolList[i].ExtensionObj.type
          })
          break;
      }
    }
    const oData = {
      signals: {},
      rect: {},
      line: {}
    }
    oData.signals[this.Period] = signals
    oData.rect[this.Period] = rect
    oData.line[this.Period] = line
    saveJsonToFile(oData, 'drawEleDatas')
  }


  this.UpdateTitleCurValue = function (kIndex) {
    for (let i in this.ChartFramePaintingList) {
      switch (this.ChartFramePaintingList[i].Name) {
        case "kLine":

          var kvalue = {
            'open': ChartData.getInstance().Data[kIndex]['open'],
            'high': ChartData.getInstance().Data[kIndex]['high'],
            'low': ChartData.getInstance().Data[kIndex]['low'],
            'close': ChartData.getInstance().Data[kIndex]['close'],
          }
          kvalue['rate'] = ChartData.getInstance().Data[kIndex]['close'] - ChartData.getInstance().Data[kIndex]['open']
          kvalue['rate'] < 0 ? kvalue['rate'] = kvalue['rate'].toFixed(2) + '(-' + (Math.abs(kvalue['rate']) / kvalue['open'] * 100).toFixed(2) + '%)' : kvalue['rate'] = kvalue['rate'].toFixed(2) + '(+' + (Math.abs(kvalue['rate']) / kvalue['open'] * 100).toFixed(2) + '%)'

          var curValue = {}
          for (let j in this.ChartFramePaintingList[i].IndicatorList) {
            var value = {}
            for (let k in this.ChartFramePaintingList[i].IndicatorList[j].key) {
              const key = this.ChartFramePaintingList[i].IndicatorList[j].key[k]
              const datetime = ChartData.getInstance().Data[kIndex].datetime
              value[key] = this.IndicatorDataList[j].Data[key][datetime] ? this.IndicatorDataList[j].Data[key][datetime].value : ''
            }
            curValue[this.ChartFramePaintingList[i].IndicatorList[j].name] = JSON.parse(JSON.stringify(value))
          }
          this.ChartFramePaintingList[i].SetTitleCurValue(kvalue, curValue)
          break;
        case 'MACD':
          var value = {}
          const name = this.ChartFramePaintingList[i].Name
          for (let k in this.ChartFramePaintingList[i].Option.key) {
            const key = this.ChartFramePaintingList[i].Option.key[k]
            value[key] = this.IndicatorDataList[name].Data[kIndex][key]
          }
          this.ChartFramePaintingList[i].SetTitleCurValue(value)
          break;
      }
    }
  }

  this.SplitData = function () {
    // 游标计算
    var leftDatasIndex = ChartData.getInstance().DataOffSet + 1 - ChartSize.getInstance().ScreenKNum()
    if (leftDatasIndex < 0 && ChartData.getInstance().DataOffSet - leftDatasIndex <= ChartData.getInstance().PeriodData[this.Period].Data.length - 1) {
      ChartData.getInstance().DataOffSet -= leftDatasIndex
      leftDatasIndex = 0
    }
    // K线数据
    var rightDatasIndex
    if (ChartData.getInstance().DataOffSet == ChartData.getInstance().PeriodData[this.Period].Data.length - 1) {
      rightDatasIndex = ChartData.getInstance().PeriodData[this.Period].Data.length
    } else {
      rightDatasIndex = ChartData.getInstance().DataOffSet
    }
    ChartData.getInstance().Data = ChartData.getInstance().PeriodData[this.Period].Data.slice(leftDatasIndex, rightDatasIndex)
    // 指标数据
    for (let i in this.IndicatorDataList) {
      if (this.IndicatorDataList[i].DataType == 0) {
        this.IndicatorDataList[i].Data = this.IndicatorDataList[i].PeriodData[this.Period].Data
      } else {
        this.IndicatorDataList[i].Data = this.IndicatorDataList[i].PeriodData[this.Period].Data.slice(leftDatasIndex, rightDatasIndex)
      }
    }
  }

  this.Loading = function () {
    this.IsLoadData = true
    this.LoadElement.style.display = "flex"
  }

  this.Loaded = function () {
    this.IsLoadData = false
    this.LoadElement.style.display = "none"
  }

  this.ClearOptCanvas = function () {
    this.OptCanvas.clearRect(0, 0, ChartSize.getInstance().ChartContentWidth, ChartSize.getInstance().ChartContentHeight)
  }

  this.ClearMainCanvas = function () {
    this.Canvas.clearRect(0, 0, ChartSize.getInstance().ChartContentWidth, ChartSize.getInstance().ChartContentHeight)
  }

  this.DrawKLineChart = function (i) {
    this.ChartFramePaintingList[i].DrawChartFramePaint()
    this.ChartFramePaintingList[i].DrawChartPaint(function () {
      // 主图K线
      var yAxis = new YAxis()
      yAxis.Create(self.Canvas, self.OptCanvas, ChartData.getInstance().Data, self.ChartFramePaintingList[i].Option.yAxis)

      self.ChartFramePaintingList[i].Option.yAxis.unitPricePx = yAxis.UnitPricePx
      self.ChartFramePaintingList[i].Option.yAxis.Min = yAxis.Min
      self.ChartFramePaintingList[i].Option.yAxis.Max = yAxis.Max
      self.ChartFramePaintingList[i].XAxis = self.XAxis

      var kLine = new KLine()
      kLine.Create(self.Canvas, self.OptCanvas, self.ChartFramePaintingList[i].Option, ChartData.getInstance().Data)

      // 主图指标
      for (let j in self.ChartFramePaintingList[i].IndicatorList) {
        var option = self.ChartFramePaintingList[i].IndicatorList[j]
        var chartOption = self.ChartFramePaintingList[i].Option
        var indicatorCustom = new IndicatorCustom()
        indicatorCustom.Create(self.Canvas, option, chartOption, self.IndicatorDataList[j].Data)
      }
    })
  }

  this.DrawMacdChart = function (i) {
    var name = this.ChartFramePaintingList[i].Name
    this.ChartFramePaintingList[i].DrawChartFramePaint()
    this.ChartFramePaintingList[i].DrawChartPaint(function () {
      var yAxis = new YAxis()
      var option
      if (self.ChartFramePaintingList[i].Option.location === 'main') {
        yAxis = self.ChartFramePaintingList['kLine'].Option.yAxis
        option = self.ChartFramePaintingList['kLine'].Option
      } else {
        yAxis.Create(self.Canvas, self.OptCanvas, self.IndicatorDataList[name].Data, self.ChartFramePaintingList[i].Option.yAxis, 6)
        self.ChartFramePaintingList[i].Option.yAxis.unitPricePx = yAxis.UnitPricePx
        self.ChartFramePaintingList[i].Option.yAxis.Min = yAxis.Min
        self.ChartFramePaintingList[i].Option.yAxis.Max = yAxis.Max
        self.ChartFramePaintingList[i].XAxis = self.XAxis
        option = self.ChartFramePaintingList[i].Option
      }

      var macd = new MACD()
      macd.Create(self.Canvas, option, self.IndicatorDataList[name].Data)
    })
  }

  this.DrawCustomIndicator = function (i) {
    var name = this.ChartFramePaintingList[i].Name
    this.ChartFramePaintingList[i].DrawChartFramePaint()
    this.ChartFramePaintingList[i].DrawChartPaint(function () {
      var option
      var chartOption
      var yAxis = new YAxis()
      var iData = new Array()

      for (let j in self.IndicatorDataList[name].Data) {
        for (let k in self.IndicatorDataList[name].Data[j]) {
          iData.push(self.IndicatorDataList[name].Data[j][k].value)
        }
      }
      yAxis.Create(self.Canvas, self.OptCanvas, iData, self.ChartFramePaintingList[i].Option.yAxis, 6)

      self.ChartFramePaintingList[i].Option.yAxis.unitPricePx = yAxis.UnitPricePx
      self.ChartFramePaintingList[i].Option.yAxis.Min = yAxis.Min
      self.ChartFramePaintingList[i].Option.yAxis.Max = yAxis.Max
      self.ChartFramePaintingList[i].XAxis = self.XAxis

      option = self.ChartFramePaintingList[i].Option
      chartOption = option

      var indicatorCustom = new IndicatorCustom()
      indicatorCustom.Create(self.Canvas, option, chartOption, self.IndicatorDataList[name].Data)
    })
  }
}

////////////////////////////////////////////
// 
//             图表Size
//
////////////////////////////////////////////
function ChartSize () {
  this.Instance = null
  //四周间距
  this.Left = 20;
  this.Right = 20;
  this.Top = 50;
  this.Bottom = 50;
  this.TitleHeight = 24;    //标题高度

  this.ChartScale = 2.3     //K线图表与指标图表的比例

  this.LeftToolWidthPx = 60
  this.TopToolHeightPx = 38
  this.DrawPictureOptDialogWidth = 230

  this.YAxisWidth = 60
  this.XAxisHeight = 28

  this.ChartContentWidth
  this.ChartContentHeight

  this.TotalHeight
  this.TotalWidth

  this.ChartOffSetTop
  this.ChartOffSetLeft

  this.CurScaleIndex = 8

  this.ScreenKNum = function () {
    return Math.ceil((this.ChartContentWidth - this.YAxisWidth - this.Left - this.Right) / (ZOOM_SEED[this.CurScaleIndex][0] + ZOOM_SEED[this.CurScaleIndex][1]))
  }

  this.GetKLineWidth = function () {
    return ZOOM_SEED[this.CurScaleIndex][0] + ZOOM_SEED[this.CurScaleIndex][1]
  }

  this.GetTotalWidth = function () {
    return this.TotalWidth
  }

  this.GetTotalHeight = function () {
    return this.TotalHeight
  }

  this.GetChartWidth = function () {
    return this.ChartContentWidth
  }

  this.GetChartHeight = function () {
    return this.ChartContentHeight
  }

  this.GetChartRealHeight = function () {
    return this.ChartContentHeight - this.Top - this.Bottom
  }

  this.GetChartRealWidth = function () {
    return this.ChartContentWidth - this.Left - this.Right
  }

  this.GetLeft = function () {
    return this.Left
  }

  this.GetRight = function () {
    return this.Right
  }

  this.GetBottom = function () {
    return this.Bottom
  }

  this.GetTop = function () {
    return this.Top
  }

  this.GetTitleHeight = function () {
    return this.TitleHeight
  }

  this.GetExtraHeight = function () {
    return this.Top + this.Bottom + this.TitleHeight
  }
}

ChartSize.getInstance = function () {
  if (!this.Instance) {
    this.Instance = new ChartSize()
  }
  return this.Instance
}

////////////////////////////////////////////
// 
//             图形画法
//
////////////////////////////////////////////
function ChartPainting () {
  this.Canvas
  this.OptCanvas
  this.Option
  this.ChartData
}

// K线画法
function KLine () {
  this.newMethod = ChartPainting
  this.newMethod()
  delete this.newMethod

  this.ValueHeight        // 绘图区域的实际高度
  this.UnitPricePx        // 单位价格占据多少px
  this.UpColor = g_GoTopChartResource.UpColor
  this.DownColor = g_GoTopChartResource.DownColor

  this.Datas

  this.Create = function (canvas, optCanvas, option, datas) {
    this.Datas = datas
    this.Canvas = canvas
    this.OptCanvas = optCanvas
    this.Option = option

    this.UnitPricePx = this.Option['yAxis']['unitPricePx']
    this.ValueHeight = this.Option.height - ChartSize.getInstance().GetExtraHeight()

    this.Draw()
  }

  this.Draw = function () {
    this.Datas.forEach((item, index, list) => {
      this.DrawKLines(index, parseFloat(item.open), parseFloat(item.close), parseFloat(item.high), parseFloat(item.low))
    })
    this.DrawCloseLine()
    this.DrawMaxHighAndMinLow()
  }

  this.DrawKLines = function (i, open, close, high, low) {
    var startX, startY, endX, endY, lowpx, highpx
    this.Canvas.beginPath()
    // datawith<=4 只绘制竖线
    if (open < close) {
      this.Canvas.fillStyle = this.UpColor
      this.Canvas.strokeStyle = this.UpColor
      if (ZOOM_SEED[ChartSize.getInstance().CurScaleIndex][0] > 2) {
        startY = this.Option.position.top + this.ValueHeight - (close - this.Option['yAxis'].Min) * this.UnitPricePx + ChartSize.getInstance().GetTop() + ChartSize.getInstance().GetTitleHeight()
        endY = this.ValueHeight - (open - this.Option['yAxis'].Min) * this.UnitPricePx + ChartSize.getInstance().GetTop() + ChartSize.getInstance().GetTitleHeight()
      }
    } else if (open > close) {
      this.Canvas.fillStyle = this.DownColor
      this.Canvas.strokeStyle = this.DownColor
      if (ZOOM_SEED[ChartSize.getInstance().CurScaleIndex][0] > 2) {
        startY = this.Option.position.top + this.ValueHeight - (open - this.Option['yAxis'].Min) * this.UnitPricePx + ChartSize.getInstance().GetTop() + ChartSize.getInstance().GetTitleHeight()
        endY = this.ValueHeight - (close - this.Option['yAxis'].Min) * this.UnitPricePx + ChartSize.getInstance().GetTop() + ChartSize.getInstance().GetTitleHeight()
      }
    } else {
      this.Canvas.fillStyle = g_GoTopChartResource.FontColor
      this.Canvas.strokeStyle = g_GoTopChartResource.FontColor
      endY = this.Option.position.top + this.ValueHeight - (open - this.Option['yAxis'].Min) * this.UnitPricePx + ChartSize.getInstance().GetTop() + ChartSize.getInstance().GetTitleHeight()
      startY = endY
    }
    startX = this.Option.position.left + ChartSize.getInstance().GetLeft() + (ZOOM_SEED[ChartSize.getInstance().CurScaleIndex][0] + ZOOM_SEED[ChartSize.getInstance().CurScaleIndex][1]) * i
    endX = startX + ZOOM_SEED[ChartSize.getInstance().CurScaleIndex][0]
    let h = endY - startY
    h < 1 && (h = 1)
    highpx = this.Option.position.top + this.ValueHeight - (high - this.Option['yAxis'].Min) * this.UnitPricePx + ChartSize.getInstance().GetTop() + ChartSize.getInstance().GetTitleHeight()
    lowpx = this.Option.position.top + this.ValueHeight - (low - this.Option['yAxis'].Min) * this.UnitPricePx + ChartSize.getInstance().GetTop() + ChartSize.getInstance().GetTitleHeight()
    this.Canvas.lineWidth = 1
    if (ZOOM_SEED[ChartSize.getInstance().CurScaleIndex][0] > 2) {
      this.Canvas.fillRect(ToFixedRect(startX), ToFixedRect(startY), ToFixedRect(endX - startX), ToFixedRect(h))
    }
    this.Canvas.setLineDash([0, 0])
    this.Canvas.moveTo(ToFixedPoint(startX + ZOOM_SEED[ChartSize.getInstance().CurScaleIndex][0] / 2), ToFixedPoint(highpx))
    this.Canvas.lineTo(ToFixedPoint(startX + ZOOM_SEED[ChartSize.getInstance().CurScaleIndex][0] / 2), ToFixedPoint(lowpx))
    this.Canvas.stroke()
    this.Canvas.closePath()
  }

  this.DrawCloseLine = function () {
    const closePrice = parseFloat(this.Datas[this.Datas.length - 1].close)
    const openPrice = parseFloat(this.Datas[this.Datas.length - 1].open)
    const y = this.ValueHeight - (closePrice - this.Option['yAxis'].Min) * this.UnitPricePx + ChartSize.getInstance().GetTop() + ChartSize.getInstance().GetTitleHeight()
    this.Canvas.beginPath()
    if (closePrice < openPrice) {
      this.Canvas.strokeStyle = this.DownColor
    } else {
      this.Canvas.strokeStyle = this.UpColor
    }
    //绘制收盘线
    this.Canvas.lineWidth = 1.5
    this.Canvas.setLineDash([1.5, 1.5])
    this.Canvas.moveTo(0, y)
    this.Canvas.lineTo(this.Option.width, y)
    this.Canvas.stroke()
    this.Canvas.closePath()

    // 绘制Y轴上的标识
    this.Canvas.beginPath()
    this.Canvas.fillStyle = this.Canvas.strokeStyle
    this.Canvas.fillRect(ToFixedRect(this.Option.width), ToFixedRect(y - 10), ToFixedRect(ChartSize.getInstance().YAxisWidth), ToFixedRect(20))
    this.Canvas.font = '12px san-serif'
    this.Canvas.fillStyle = g_GoTopChartResource.FontLightColor
    this.Canvas.fillText(closePrice, this.Option.width + 10, y + 5)
    this.Canvas.lineWidth = 1
    this.Canvas.setLineDash([0, 0])
    this.Canvas.strokeStyle = g_GoTopChartResource.FontLightColor
    this.Canvas.moveTo(ToFixedPoint(this.Option.width), ToFixedPoint(y))
    this.Canvas.lineTo(ToFixedPoint(this.Option.width) + 5, ToFixedPoint(y))
    this.Canvas.stroke()
    this.Canvas.closePath()
  }

  this.DrawMaxHighAndMinLow = function () {
    let max = 0
    let maxIndex = 0
    let min = 0
    let minIndex = 0
    this.Datas.forEach((item, index) => {
      if (max < item.high) {
        max = item.high
        maxIndex = index
      }
      if (min == 0 || min > item.low) {
        min = item.low
        minIndex = index
      }
    })
    const maxX = ChartSize.getInstance().GetLeft() + (ZOOM_SEED[ChartSize.getInstance().CurScaleIndex][0] + ZOOM_SEED[ChartSize.getInstance().CurScaleIndex][1]) * maxIndex
    const maxY = this.ValueHeight - (max - this.Option['yAxis'].Min) * this.UnitPricePx + ChartSize.getInstance().GetTop() + ChartSize.getInstance().GetTitleHeight()
    const maxTW = this.OptCanvas.measureText(max).width

    const minX = ChartSize.getInstance().GetLeft() + (ZOOM_SEED[ChartSize.getInstance().CurScaleIndex][0] + ZOOM_SEED[ChartSize.getInstance().CurScaleIndex][1]) * minIndex
    const minY = this.ValueHeight - (min - this.Option['yAxis'].Min) * this.UnitPricePx + ChartSize.getInstance().GetTop() + ChartSize.getInstance().GetTitleHeight()
    const minTW = this.OptCanvas.measureText(min).width

    this.Canvas.fillStyle = g_GoTopChartResource.FontLightColor
    this.Canvas.font = '12px san-serif'
    if (maxIndex < (this.Datas.length - 1) / 2) {
      this.Canvas.fillText(max, maxX, maxY)
    } else {
      this.Canvas.fillText(max, maxX - maxTW, maxY)
    }
    if (minIndex < (this.Datas.length - 1) / 2) {
      this.Canvas.fillText(min, minX, minY + 10)
    } else {
      this.Canvas.fillText(min, minX - minTW, minY + 10)
    }
  }
}

// X轴画法
function XAxis () {
  this.newMethod = ChartPainting
  this.newMethod()
  delete this.newMethod

  this.Data

  this.Create = function (canvas, optCanvas, option, data) {
    this.Canvas = canvas
    this.OptCanvas = optCanvas
    this.Option = option
    this.Data = data
    this.Draw()
  }

  /**
 * @description 开始绘制
 */
  this.Draw = function () {
    this.Canvas.beginPath()
    this.Canvas.strokeStyle = g_GoTopChartResource.FontColor
    this.Canvas.lineWidth = 1
    this.Canvas.setLineDash([0, 0])
    this.Canvas.moveTo(0, this.Option.position.top)
    this.Canvas.lineTo(this.Option.width, this.Option.position.top)
    this.Canvas.stroke()
    this.Canvas.closePath()
  }
}

// Y轴画法
function YAxis () {
  this.newMethod = ChartPainting
  this.newMethod()
  delete this.newMethod

  this.Min                    // Y轴上的最小值
  this.Max                    // Y轴上的最大值

  this.LabelList = new Array()

  this.ValueHeight            // Y轴实际高度范围
  this.UnitValue = 0          // Y轴上每段是多少
  this.UnitSpacing = 0        // Y轴上每段的间距是多少
  this.UnitPricePx = 0        // 单位值是多少px

  this.SplitNumber = 16       // Y轴要分为多少段
  this.Symmetrical = false    // 是否要求正负刻度对称
  this.Deviation = false      // 是否允许误差，即实际分出的段数不等于splitNumber

  this.Datas
  this.Width = 60

  this.Create = function (canvas, optCanvas, datas, option, splitNumber) {
    this.Canvas = canvas
    this.OptCanvas = optCanvas
    this.Datas = datas
    this.Option = option
    splitNumber && (this.SplitNumber = splitNumber)
    this.ValueHeight = this.Option.height - ChartSize.getInstance().GetTop() - ChartSize.getInstance().GetBottom() - ChartSize.getInstance().GetTitleHeight()

    this.CalculationMinMaxValue(this.Option.key)
    this.CalculationUnitValue()
    this.CalculationUnitSpacing()
    this.CalculationLabelList()
    this.Draw()
  }

  /**
   * @description 计算最大值和最小值
   */
  this.CalculationMinMaxValue = function (args) {
    if (this.Option.name === 'kLine') {
      this.Min = Math.min.apply(Math, this.Datas.map(function (o) { return parseFloat(o.low) }))
      this.Max = Math.max.apply(Math, this.Datas.map(function (o) { return parseFloat(o.high) }))
    } else if (this.Option.type === 'custom') {
      this.Min = Math.min.apply(Math, this.Datas)
      this.Max = Math.max.apply(Math, this.Datas)
    } else {
      var minArray = []
      var maxArray = []

      for (let i in args) {
        minArray.push(Math.min.apply(Math, this.Datas.map(function (o) { return parseFloat(o[args[i]]) })))
        maxArray.push(Math.max.apply(Math, this.Datas.map(function (o) { return parseFloat(o[args[i]]) })))
      }

      this.Min = Math.min.apply(Math, minArray)
      this.Max = Math.max.apply(Math, maxArray)
    }
  }

  /**
* @description 计算单位刻度值
*/
  this.CalculationUnitValue = function () {
    function fixedNum (num) {
      if (("" + num).indexOf('.') >= 0) num = parseFloat(num.toFixed(8));
      return num;
    }
    //1.初始化
    var symmetrical = false;//是否要求正负刻度对称。默认为false，需要时请设置为true
    var deviation = false;//是否允许误差，即实际分出的段数不等于splitNumber
    var magic = [10, 15, 20, 25, 30, 40, 50, 60, 70, 80, 90, 100];//魔数数组经过扩充，放宽魔数限制避免出现取不到魔数的情况。
    var max, min, splitNumber;
    splitNumber = this.SplitNumber;//理想的刻度间隔段数，即希望刻度区间有多少段
    max = this.Max;//调用js已有函数计算出最大值
    min = this.Min;//计算出最小值
    //2.计算出初始间隔tempGap和缩放比例multiple
    var tempGap = (max - min) / splitNumber;//初始刻度间隔的大小。
    //设tempGap除以multiple后刚刚处于魔数区间内，先求multiple的幂10指数，例如当tempGap为120，想要把tempGap映射到魔数数组（即处理为10到100之间的数），则倍数为10，即10的1次方。
    var multiple = Math.floor(Math.log10(tempGap) - 1);//这里使用Math.floor的原因是，当Math.log10(tempGap)-1无论是正负数都需要向下取整。不能使用parseInt或其他取整逻辑代替。
    multiple = Math.pow(10, multiple);//刚才是求出指数，这里求出multiple的实际值。分开两行代码避免有人看不懂
    //3.取出邻近较大的魔数执行第一次计算
    var tempStep = tempGap / multiple;//映射后的间隔大小
    var estep;//期望得到的间隔
    var lastIndex = -1;//记录上一次取到的魔数下标，避免出现死循环
    for (var i = 0; i < magic.length; i++) {
      if (magic[i] > tempStep) {
        estep = magic[i] * multiple;//取出第一个大于tempStep的魔数，并乘以multiple作为期望得到的最佳间隔
        break;
      }
    }
    //4.求出期望的最大刻度和最小刻度，为estep的整数倍
    var maxi, mini;
    function countDegree (estep) {
      //这里的parseInt是我无意中写出来的，本来我是想对maxi使用Math.floor，对mini使用Math.ceil的。这样能向下取到邻近的一格，不过后面发现用parseInt好像画出来图的比较好看
      maxi = parseInt(max / estep + 1) * estep;//最终效果是当max/estep属于(-1,Infinity)区间时，向上取1格，否则取2格。
      mini = parseInt(min / estep - 1) * estep;//当min/estep属于(-Infinity,1)区间时，向下取1格，否则取2格。
      //如果max和min刚好在刻度线的话，则按照上面的逻辑会向上或向下多取一格
      if (max === 0) maxi = 0;//这里进行了一次矫正，优先取到0刻度
      if (min === 0) mini = 0;
      if (symmetrical && maxi * mini < 0) {//如果需要正负刻度对称且存在异号数据
        var tm = Math.max(Math.abs(maxi), Math.abs(mini));//取绝对值较大的一方
        maxi = tm;
        mini = -tm;
      }
    }
    countDegree(estep);
    if (deviation) {//如果允许误差，即实际分段数可以不等于splitNumber，则直接结束
      var interval = fixedNum(estep);
      return;
    }
    //5.当正负刻度不对称且0刻度不在刻度线上时，重新取魔数进行计算//确保其中一条分割线刚好在0刻度上。
    else if (!symmetrical || maxi * mini > 0) {
      outter: do {
        //计算模拟的实际分段数
        var tempSplitNumber = Math.round((maxi - mini) / estep);
        //当趋势单调性发生变化时可能出现死循环，需要进行校正
        if ((i - lastIndex) * (tempSplitNumber - splitNumber) < 0) {//此处检查单调性变化且未取到理想分段数
          //此处的校正基于合理的均匀的魔数数组，即tempSplitNumber和splitNumber的差值较小如1和2，始终取大刻度
          while (tempSplitNumber < splitNumber) {//让maxi或mini增大或减少一个estep直到取到理想分段数
            if ((mini - min) <= (maxi - max) && mini != 0 || maxi == 0) {//在尽量保留0刻度的前提下，让更接近最值的一边扩展一个刻度
              mini -= estep;
            } else {
              maxi += estep;
            }
            tempSplitNumber++;
            if (tempSplitNumber == splitNumber)
              break outter;
          }
        }
        //当魔数下标越界或取到理想分段数时退出循环
        if (i >= magic.length - 1 || i <= 0 || tempSplitNumber == splitNumber) break;
        //记录上一次的魔数下标
        lastIndex = i;
        //尝试取符合趋势的邻近魔数
        if (tempSplitNumber > splitNumber) estep = magic[++i] * multiple;
        else estep = magic[--i] * multiple;
        //重新计算刻度
        countDegree(estep);
      } while (tempSplitNumber != splitNumber);
    }
    //6.无论计算始终把maxi-mini分成splitNumber段，得到间隔interval。不过前面的算法已经尽量的保证刻度最优了，即interval接近或等于理想刻度estep。
    this.Max = fixedNum(maxi);
    this.Min = fixedNum(mini);
    this.UnitValue = fixedNum((maxi - mini) / splitNumber);
  }

  /**
 * @description 计算单位间距
 */
  this.CalculationUnitSpacing = function () {
    this.UnitPricePx = this.ValueHeight / (this.Max - this.Min)
    this.UnitSpacing = this.UnitValue * this.UnitPricePx
  }

  /**
 * @description 计算Label数组
 */
  this.CalculationLabelList = function () {
    let label = this.Min
    while (label <= this.Max) {
      let item = {
        label: label,
        y: (this.Max - label) * this.UnitPricePx + ChartSize.getInstance().GetTitleHeight() + ChartSize.getInstance().GetTop() + this.Option.position.top
      }
      this.LabelList.push(item)
      label = label.add(this.UnitValue)
    }
  }

  /**
 * @description 开始绘制
 */
  this.Draw = function () {
    this.Canvas.beginPath()
    this.Canvas.fillStyle = g_GoTopChartResource.FontColor
    this.Canvas.font = '12px sans-serif'
    this.LabelList.forEach((item, index, list) => {
      this.Canvas.fillText(item.label, this.Option.position.left + 10, item.y + 5)
    })
    this.Canvas.stroke()
    this.Canvas.closePath()

    this.Canvas.strokeStyle = g_GoTopChartResource.BorderColor
    this.Canvas.beginPath()
    this.Canvas.lineWidth = 1
    this.Canvas.setLineDash([0, 0])
    this.Canvas.moveTo(this.Option.position.left, this.Option.position.top)
    this.Canvas.lineTo(this.Option.position.left, this.Option.position.top + this.Option.height)
    this.LabelList.forEach((item, index, list) => {
      this.Canvas.moveTo(this.Option.position.left, ToFixedPoint(item.y))
      this.Canvas.lineTo(this.Option.position.left + 5, ToFixedPoint(item.y))
    })
    this.Canvas.stroke()
    this.Canvas.closePath()

    // 网格线绘制
    this.Canvas.beginPath()
    this.Canvas.strokeStyle = g_GoTopChartResource.BorderColor
    this.Canvas.lineWidth = 0.5
    this.LabelList.forEach((item, index, list) => {
      this.Canvas.moveTo(0, ToFixedPoint(item.y))
      this.Canvas.lineTo(ChartSize.getInstance().GetChartWidth() - ChartSize.getInstance().YAxisWidth, ToFixedPoint(item.y))
    })
    this.Canvas.stroke()
    this.Canvas.closePath()

    this.Canvas.beginPath()
    this.Canvas.strokeStyle = g_GoTopChartResource.BorderColor
    this.Canvas.lineWidth = 2
    this.Canvas.moveTo(0, this.Option.position.top + this.Option.height)
    this.Canvas.lineTo(ChartSize.getInstance().GetChartWidth(), this.Option.position.top + this.Option.height)
    this.Canvas.stroke()
    this.Canvas.closePath()
  }
}

// MACD画法
function MACD () {
  this.newMethod = ChartPainting
  this.newMethod()
  delete this.newMethod

  this.Datas
  this.ZeroY = null

  this.Create = function (canvas, option, datas) {
    this.Canvas = canvas
    this.Option = option
    this.Datas = datas

    if (this.Option.yAxis.Min < 0) {
      this.ZeroY = this.Option.position.top + this.Option.height - ChartSize.getInstance().GetTop() - Math.abs(this.Option.yAxis.Min * this.Option.yAxis.unitPricePx)
    }

    this.Draw()
  }

  this.Draw = function () {
    this.Canvas.beginPath()
    this.Canvas.strokeStyle = this.Option.style['DIFF']['color']
    this.Canvas.lineWidth = 1
    for (var i = 0, j = this.Datas.length; i < j; i++) {
      this.DrawCurve(i, 'DIFF')
    }
    this.Canvas.stroke()
    this.Canvas.closePath()

    // DEA
    this.Canvas.beginPath()
    this.Canvas.strokeStyle = this.Option.style['DEA']['color']
    this.Canvas.lineWidth = 1
    for (var i = 0, j = this.Datas.length; i < j; i++) {
      this.DrawCurve(i, 'DEA')
    }
    this.Canvas.stroke()
    this.Canvas.closePath()
    // macd
    this.Canvas.beginPath()
    this.Canvas.lineWidth = 2
    for (var i = 0, j = this.Datas.length; i < j; i++) {
      if (this.Datas[i]['MACD'] > 0) {
        this.DrawVerticalUpLine(i, 'MACD')
      }
    }
    this.Canvas.stroke()
    this.Canvas.closePath()

    this.Canvas.beginPath()
    this.Canvas.lineWidth = 2
    for (var i = 0, j = this.Datas.length; i < j; i++) {
      if (this.Datas[i]['MACD'] < 0) {
        this.DrawVerticalDownLine(i, 'MACD')
      }
    }
    this.Canvas.stroke()
    this.Canvas.closePath()
  }

  this.DrawCurve = function (i, attrName) {
    var StartY
    var StartX = ChartSize.getInstance().GetLeft() + (ZOOM_SEED[ChartSize.getInstance().CurScaleIndex][0] + ZOOM_SEED[ChartSize.getInstance().CurScaleIndex][1]) * i + ZOOM_SEED[ChartSize.getInstance().CurScaleIndex][0] / 2 + this.Option.position.left
    if (parseFloat(this.Datas[i][attrName]) >= 0) {
      this.ZeroY != null ? StartY = this.ZeroY - (parseFloat(this.Datas[i][attrName]) * this.Option.yAxis.unitPricePx) : this.StartY = this.Option.position.top + this.Option.height + ChartSize.getInstance().GetTitleHeight() - (parseFloat(this.Datas[i][attrName]) * this.Option.yAxis.unitPricePx) - ChartSize.getInstance().GetTop() + ChartSize.getInstance().GetTitleHeight()
    } else {
      StartY = this.ZeroY + (Math.abs(parseFloat(this.Datas[i][attrName]) * this.Option.yAxis.unitPricePx))
    }
    if (i === 0) {
      this.Canvas.moveTo(StartX, StartY)
    }
    this.Canvas.lineTo(StartX, StartY)
  }

  this.DrawVerticalDownLine = function (i, attrName) {
    var StartX = ChartSize.getInstance().GetLeft() + (ZOOM_SEED[ChartSize.getInstance().CurScaleIndex][0] + ZOOM_SEED[ChartSize.getInstance().CurScaleIndex][1]) * i + ZOOM_SEED[ChartSize.getInstance().CurScaleIndex][0] / 2 + this.Option.position.left
    this.Canvas.strokeStyle = this.Option.style['MACD']['color']['down']
    var StartY = this.ZeroY + (Math.abs(parseFloat(this.Datas[i][attrName]) * this.Option.yAxis.unitPricePx))
    this.Canvas.moveTo(StartX, StartY)
    this.Canvas.lineTo(StartX, this.ZeroY)
  }

  this.DrawVerticalUpLine = function (i, attrName) {
    var StartY
    var StartX = ChartSize.getInstance().GetLeft() + (ZOOM_SEED[ChartSize.getInstance().CurScaleIndex][0] + ZOOM_SEED[ChartSize.getInstance().CurScaleIndex][1]) * i + ZOOM_SEED[ChartSize.getInstance().CurScaleIndex][0] / 2 + this.Option.position.left
    this.Canvas.strokeStyle = this.Option.style['MACD']['color']['up']
    this.ZeroY != null ? StartY = this.ZeroY - (parseFloat(this.Datas[i][attrName]) * this.Option.yAxis.unitPricePx) : StartY = this.Option.position.top + this.Option.height + ChartSize.getInstance().GetTitleHeight() - (parseFloat(this.Datas[i][attrName]) * this.Option.yAxis.unitPricePx) - ChartSize.getInstance().GetTop() + ChartSize.getInstance().GetTitleHeight()
    this.Canvas.moveTo(StartX, StartY)
    this.Canvas.lineTo(StartX, this.ZeroY)
  }
}


// 自定义指标
function IndicatorCustom () {
  this.Name
  this.IsHiddenStudy = false
  this.Plots = new Array()
  this.Styles
  this.Data
  this.Precision
  this.Params
  this.Canvas
  this.ChartOption

  this.Create = function (canvas, option, chartOption, data) {
    this.Name = option.name
    this.Precision = option.precision
    this.Plots = option.plots
    this.Styles = option.style
    this.Params = option.params
    this.ChartOption = chartOption
    this.Canvas = canvas
    this.Data = data
    this.Draw()
  }

  this.Draw = function () {
    for (let i in this.Plots) {
      switch (this.Plots[i].type) {
        case 'line':
          this.LineShape(this.Plots[i].id)
          break;
        case 'rect':
          this.RectShap(this.Plots[i].id)
          break;
        case 'text':
          break;
        case 'icon':
          break;
      }
    }
  }

  this.LineShape = function (plot) {
    this.Canvas.beginPath()
    this.Canvas.lineWidth = this.Styles[plot].lineWidth
    this.Canvas.strokeStyle = this.Styles[plot].color
    var iData = this.Data[plot]
    var kLineData = ChartData.getInstance().Data
    const _t = this

    for (var l in kLineData) {
      if (iData[kLineData[l].datetime]) {
        let endIndex = null
        for (let c = l; c < kLineData.length; c++) {
          if (iData[kLineData[l].datetime].end_time == kLineData[c].datetime) {
            endIndex = c
            break
          }
        }
        if (endIndex == null) continue
        calPointAndDraw(endIndex)
      }
    }

    function calPointAndDraw (endIndex) {
      let value1 = 0
      let value2 = 0
      if (iData[kLineData[l].datetime].type == 'up') {
        value1 = iData[kLineData[l].datetime].low
        value2 = iData[kLineData[l].datetime].high
      } else {
        value1 = iData[kLineData[l].datetime].high
        value2 = iData[kLineData[l].datetime].low
      }
      const startX = (ZOOM_SEED[ChartSize.getInstance().CurScaleIndex][0] + ZOOM_SEED[ChartSize.getInstance().CurScaleIndex][1]) * (parseInt(l) + 1) - ZOOM_SEED[ChartSize.getInstance().CurScaleIndex][0] / 2 - ZOOM_SEED[ChartSize.getInstance().CurScaleIndex][1] + _t.ChartOption.position.left + ChartSize.getInstance().GetLeft()
      const startY = _t.ChartOption.height - ChartSize.getInstance().GetExtraHeight() - (value1 - _t.ChartOption['yAxis'].Min) * _t.ChartOption['yAxis'].unitPricePx + ChartSize.getInstance().GetTop() + ChartSize.getInstance().GetTitleHeight() + _t.ChartOption.position.top
      const endX = (ZOOM_SEED[ChartSize.getInstance().CurScaleIndex][0] + ZOOM_SEED[ChartSize.getInstance().CurScaleIndex][1]) * (parseInt(endIndex) + 1) - ZOOM_SEED[ChartSize.getInstance().CurScaleIndex][0] / 2 - ZOOM_SEED[ChartSize.getInstance().CurScaleIndex][1] + _t.ChartOption.position.left + ChartSize.getInstance().GetLeft()
      const endY = _t.ChartOption.height - ChartSize.getInstance().GetExtraHeight() - (value2 - _t.ChartOption['yAxis'].Min) * _t.ChartOption['yAxis'].unitPricePx + ChartSize.getInstance().GetTop() + ChartSize.getInstance().GetTitleHeight() + _t.ChartOption.position.top
      drawLine(startX, startY, endX, endY)
    }

    function drawLine (x1, y1, x2, y2) {
      _t.Canvas.beginPath()
      _t.Canvas.moveTo(x1, y1)
      _t.Canvas.lineTo(x2, y2)
      _t.Canvas.stroke()
      _t.Canvas.closePath()
    }
  }

  this.RectShap = function (plot) {
    var iData = this.Data[plot]
    var kLineData = ChartData.getInstance().Data
    this.Canvas.fillStyle = this.Styles[plot].color
    for (var r in kLineData) {
      if (iData[kLineData[r].datetime]) {
        this.Canvas.beginPath()
        const startIndex = r
        let endIndex = null
        for (let c = startIndex; c < kLineData.length; c++) {
          if (iData[kLineData[r].datetime].end_time == kLineData[c].datetime) {
            endIndex = c
            break
          }
        }
        if (endIndex == null) continue
        const startX = (ZOOM_SEED[ChartSize.getInstance().CurScaleIndex][0] + ZOOM_SEED[ChartSize.getInstance().CurScaleIndex][1]) * (parseInt(startIndex) + 1) - ZOOM_SEED[ChartSize.getInstance().CurScaleIndex][0] / 2 - ZOOM_SEED[ChartSize.getInstance().CurScaleIndex][1] + this.ChartOption.position.left + ChartSize.getInstance().GetLeft()
        const startY = this.ChartOption.height - ChartSize.getInstance().GetExtraHeight() - (iData[kLineData[r].datetime]['high'] - this.ChartOption['yAxis'].Min) * this.ChartOption['yAxis'].unitPricePx + ChartSize.getInstance().GetTop() + ChartSize.getInstance().GetTitleHeight() + this.ChartOption.position.top
        const endX = (ZOOM_SEED[ChartSize.getInstance().CurScaleIndex][0] + ZOOM_SEED[ChartSize.getInstance().CurScaleIndex][1]) * (parseInt(endIndex) + 1) - ZOOM_SEED[ChartSize.getInstance().CurScaleIndex][0] / 2 - ZOOM_SEED[ChartSize.getInstance().CurScaleIndex][1] + this.ChartOption.position.left + ChartSize.getInstance().GetLeft()
        const endY = this.ChartOption.height - ChartSize.getInstance().GetExtraHeight() - (iData[kLineData[r].datetime]['low'] - this.ChartOption['yAxis'].Min) * this.ChartOption['yAxis'].unitPricePx + ChartSize.getInstance().GetTop() + ChartSize.getInstance().GetTitleHeight() + this.ChartOption.position.top
        this.Canvas.fillRect(ToFixedRect(startX), ToFixedRect(startY), ToFixedRect(endX - startX), ToFixedRect(endY - startY))
        this.Canvas.stroke()
      }
    }
  }

}

////////////////////////////////////////////
// 
//             图表框架框架画法
//
////////////////////////////////////////////
function ChartFramePainting () {
  this.ChartElement
  this.Option
  this.ChartTitlePainting
  this.Canvas
  this.OptCanvas
  this.XAxis
  this.YAxis
  this.Name
  this.ChartData
  this.IndicatorList = {}  // 指标

  this.DrawChartFramePaint = function () {
    // window title
    if (!this.ChartTitlePainting) {
      this.ChartTitlePainting = new ChartTitlePainting()
      this.ChartElement.appendChild(this.ChartTitlePainting.Create(this.Option, this.IndicatorList))
      this.ChartElement.appendChild(this.ChartTitlePainting.CreateIndicatorTitle())
      this.ChartTitlePainting.SetSize()
      this.ChartTitlePainting.CreateValueBoX()
      this.ChartTitlePainting.CreateIndicatorValueBox()
    } else {
      this.Resize()
    }
  }

  this.DrawChartPaint = function (callback) {
    callback()
  }

  this.SetTitleCurValue = function (curValue, indicatorValue) {
    this.ChartTitlePainting.SetValue(curValue, indicatorValue)
  }

  this.Resize = function () {
    this.ChartTitlePainting.SetSize()
  }
}

////////////////////////////////////////////
// 
//             拓展图形画法
//
////////////////////////////////////////////
function ChartExtendPainting () {
  this.DivElement
  this.ParentDivElement
  this.FeaturesList = new Array()
  this.CurSelectIndex
}

// 顶部工具栏
function TopToolContainer () {
  this.newMethod = ChartExtendPainting
  this.newMethod()
  delete this.newMethod

  var self = this

  this.Width
  this.FeaturesList = [
    { id: 'goto_btn', divClass: 'item', divStyle: '', spanClass: 'iconfont icon-lsh-jump', spanStyle: 'margin-right:2px;', text: '跳转到' },
    { id: 'period-btn', divClass: 'item', divStyle: '', spanClass: '', spanStyle: '', text: '周 期' },
    { id: 'indicators-btn', divClass: 'item', divStyle: '', spanClass: 'iconfont icon-fx', spanStyle: 'margin-right:2px;', text: '指 标' },
    { id: 'pre-signal-btn', divClass: 'item', divStyle: '', spanClass: 'iconfont icon-xiayiye1', spanStyle: 'margin-right:2px;', text: '信 号' },
    { id: 'next-signal-btn', divClass: 'item', divStyle: '', spanClass: 'iconfont icon-xiayiye', spanStyle: 'margin-right:2px;', text: '' },
    { id: null, divClass: '', divStyle: 'flex-grow:1', spanClass: '', spanStyle: '', text: '' },
    { id: 'save-btn', divClass: 'item', divStyle: 'border-left:1.5px solid #353d5a', spanClass: 'iconfont icon-save', spanStyle: '', text: '保存' },
    { id: 'settings-btn', divClass: 'item', divStyle: '', spanClass: 'iconfont icon-shezhi', spanStyle: '', text: '' },
    { id: 'scale-big-btn', divClass: 'item', divStyle: '', spanClass: 'iconfont icon-quanping', spanStyle: '', text: '' },
    { id: 'shot-btn', divClass: 'item', divStyle: '', spanClass: 'iconfont icon-kuaizhao', spanStyle: '', text: '' },
  ]

  this.Create = function () {
    this.DivElement = document.createElement('div')
    this.DivElement.id = Guid()
    this.DivElement.className = "top-container"

    this.DivElement.style.width = this.Width + 'px'
    this.DivElement.style.height = g_GoTopChartResource.TopToolHeightPx + 'px'
    this.DivElement.style.backgroundColor = g_GoTopChartResource.BgColor
    this.DivElement.style.borderBottom = g_GoTopChartResource.BorderWidth[0] + "px solid " + g_GoTopChartResource.BorderColor

    this.HTML = ''

    for (let i in this.FeaturesList) {
      this.HTML +=
        '<div id="' + this.FeaturesList[i].id + '" class="' + this.FeaturesList[i].divClass + '" style="' + this.FeaturesList[i].divStyle + '"><span class="' + this.FeaturesList[i].spanClass + '" style="' + this.FeaturesList[i].spanStyle + '"></span>' + this.FeaturesList[i].text + '</div>'
    }

    this.DivElement.innerHTML = this.HTML
    return this.DivElement
  }

  this.SetWidth = function (width) {
    this.DivElement.style.width = width
  }

  this.RegisterClickEvent = function (callback) {
    for (let i in this.FeaturesList) {
      $('#' + this.FeaturesList[i].id).click(function (e) {
        callback(self.FeaturesList[i].id)
      })
    }
  }
}

// 左侧工具栏
function LeftToolContainer () {
  this.newMethod = ChartExtendPainting
  this.newMethod()
  delete this.newMethod

  this.FeaturesList = [
    { id: 'cursor-tool', divClass: "draw-tool-item", divStyle: 'margin-top:10px', spanClass: 'iconfont icon-icongb', spanStyle: 'font-size: 30px;' },
    { id: 'line-tool', divClass: "draw-tool-item", divStyle: '', spanClass: 'iconfont icon-xianduan1', spanStyle: 'font-size: 30px;' },
    { id: 'rect-tool', divClass: "draw-tool-item", divStyle: '', spanClass: 'iconfont icon-juxing', spanStyle: 'font-size: 30px;' },
    { id: 'sell-tool', divClass: "draw-tool-item", divStyle: '', spanClass: 'iconfont icon-sell', spanStyle: 'font-size: 30px;' },
    { id: 'buy-tool', divClass: "draw-tool-item", divStyle: '', spanClass: 'iconfont icon-buy', spanStyle: 'font-size: 30px;' }
  ]

  this.Height

  this.Create = function () {
    this.DivElement = document.createElement('div')
    this.DivElement.id = Guid()
    this.DivElement.style.width = g_GoTopChartResource.LeftToolWidthPx + 'px'
    this.DivElement.style.height = this.Height + 'px'
    this.DivElement.style.backgroundColor = g_GoTopChartResource.BgColor
    this.DivElement.style.borderRight = g_GoTopChartResource.BorderWidth[0] + "px solid " + g_GoTopChartResource.BorderColor

    this.HTML = '<div style="text-align:center;height:40px;line-height:40px;width:60px;border-bottom:1px solid #353d5a"><span class="iconfont icon-caidan" style="font-size: 28px;color: #8d9bab;"></span></div>'

    for (let i in this.FeaturesList) {
      this.HTML += '<div id="' + this.FeaturesList[i].id + '" class="' + this.FeaturesList[i].divClass + '" style="' + this.FeaturesList[i].divStyle + '"><span class="' + this.FeaturesList[i].spanClass + '" style="' + this.FeaturesList[i].spanStyle + '"></span></div>'
    }

    this.DivElement.innerHTML = this.HTML
    return this.DivElement
  }

  this.SetHeight = function (height) {
    this.DivElement.style.height = height
  }

  this.RegisterClickEvent = function (callback) {
    for (let i in this.FeaturesList) {
      $('#' + this.FeaturesList[i].id).click(function (e) { callback(e) })
    }
  }
}

////////////////////////////////////////////
// 
//             画图工具
//
////////////////////////////////////////////
function ChartDrawPicture () {
  this.Canvas
  this.Option

  this.Position = new Array()
  this.PointCount

  this.ExtensionObj = {}

  this.Color
  this.IsFinished = false
  this.IsSelect = false
  this.IsHover = false
  this.Name

  this.Create = function (canvas, option) {
    this.Canvas = canvas
    this.Option = option
  }

  this.SetPoint = function (x, y) {
    const kLineData = ChartData.getInstance().Data
    var index = Math.ceil((x - ChartSize.getInstance().GetLeft()) / (ZOOM_SEED[ChartSize.getInstance().CurScaleIndex][1] + ZOOM_SEED[ChartSize.getInstance().CurScaleIndex][0])) - 1
    var price = (((this.Option['height'] - ChartSize.getInstance().GetExtraHeight() - (y - this.Option['position']['top'] - ChartSize.getInstance().GetTop() - ChartSize.getInstance().GetTitleHeight())) / this.Option['yAxis'].unitPricePx) + this.Option['yAxis'].Min)
    var item = [kLineData[index].datetime, price]
    this.Position.push(item)
  }

  /**
   * @description update point axis
   * @param {update point is index} index 
   * @param {move hori px} xStep 
   * @param {move veri px} yStep 
   */
  this.UpdatePoint = function (i, xStep, yStep) {
    const kLineData = ChartData.getInstance().Data
    var y = this.Option.height - ChartSize.getInstance().GetExtraHeight() - (this.Position[i][1] - this.Option['yAxis'].Min) * this.Option['yAxis'].unitPricePx + ChartSize.getInstance().GetTop() + ChartSize.getInstance().GetTitleHeight() + this.Option.position.top
    y += yStep
    this.Position[i][1] = ((((this.Option['height'] - ChartSize.getInstance().GetExtraHeight()) - (y - this.Option['position']['top'] - ChartSize.getInstance().GetTop() - ChartSize.getInstance().GetTitleHeight())) / this.Option['yAxis'].unitPricePx) + this.Option['yAxis'].Min)
    for (let k in kLineData) {
      if (this.Position[i][0] == kLineData[k].datetime) {
        this.Position[i][0] = kLineData[parseInt(k) + xStep].datetime
        break;
      }
    }
  }

  this.Draw = function () { }

  this.DrawPoint = function () {
    const kLineData = ChartData.getInstance().Data
    if (this.Position.length > 0 && (this.IsSelect || this.IsHover)) {
      for (var i in this.Position) {
        var index = 0
        for (let k in kLineData) {
          if (this.Position[i][0] == kLineData[k].datetime) {
            index = parseInt(k)
            break;
          }
        }
        var x = (ZOOM_SEED[ChartSize.getInstance().CurScaleIndex][0] + ZOOM_SEED[ChartSize.getInstance().CurScaleIndex][1]) * (index + 1) - ZOOM_SEED[ChartSize.getInstance().CurScaleIndex][0] / 2 - ZOOM_SEED[ChartSize.getInstance().CurScaleIndex][1] + this.Option.position.left + ChartSize.getInstance().GetLeft()
        var y = this.Option.height - ChartSize.getInstance().GetExtraHeight() - (this.Position[i][1] - this.Option['yAxis'].Min) * this.Option['yAxis'].unitPricePx + ChartSize.getInstance().GetTop() + ChartSize.getInstance().GetTitleHeight() + this.Option.position.top

        this.Canvas.beginPath();
        this.Canvas.arc(ToFixedPoint(x), ToFixedPoint(y), 5, 0, 360, false);
        this.Canvas.fillStyle = '#000000';      //填充颜色
        this.Canvas.strokeStyle = this.Color
        this.Canvas.fill();                         //画实心圆
        this.Canvas.stroke()
        this.Canvas.closePath();
      }
    }
  }

  this.ClipFrame = function (x, y) {
    this.Canvas.save()
    this.Canvas.beginPath()
    this.Canvas.rect(this.Option.position.left + ChartSize.getInstance().GetLeft(), this.Option.position.top + ChartSize.getInstance().GetTop() + ChartSize.getInstance().GetTitleHeight(), this.Option.width - ChartSize.getInstance().GetLeft() - ChartSize.getInstance().GetRight(), this.Option.height - ChartSize.getInstance().GetExtraHeight())
    this.Canvas.clip()
  }

  this.IsPointInPath = function (x, y) {
    if (this.Name === 'line') {
      return this.IsPointInLinePath(x, y)
    } else if (this.Name === 'rect') {
      return this.IsPointInRectPath(x, y)
    } else if (this.Name === 'signals') {
      return this.IsPointInArcPath(x, y)
    }
  }

  this.IsPointInLinePath = function (x, y) {
    if (!this.Option) return -1
    if (this.Position.length < this.PointCount) return -1
    const kLineData = ChartData.getInstance().Data
    for (let i in this.Position) {
      var index = null
      for (let k in kLineData) {
        if (this.Position[i][0] == kLineData[k].datetime) {
          index = parseInt(k)
          break;
        }
      }
      this.Canvas.beginPath();
      var ex = (ZOOM_SEED[ChartSize.getInstance().CurScaleIndex][0] + ZOOM_SEED[ChartSize.getInstance().CurScaleIndex][1]) * (index + 1) - ZOOM_SEED[ChartSize.getInstance().CurScaleIndex][0] / 2 - ZOOM_SEED[ChartSize.getInstance().CurScaleIndex][1] + this.Option.position.left + ChartSize.getInstance().GetLeft()
      var ey = this.Option.height - ChartSize.getInstance().GetExtraHeight() - (this.Position[i][1] - this.Option['yAxis'].Min) * this.Option['yAxis'].unitPricePx + ChartSize.getInstance().GetTop() + ChartSize.getInstance().GetTitleHeight() + this.Option.position.top
      this.Canvas.arc(ex, ey, 5, 0, 360);
      if (this.Canvas.isPointInPath(x, y)) return i;
    }

    var x1_index = null
    for (let k_x1_index in kLineData) {
      if (this.Position[0][0] == kLineData[k_x1_index].datetime) {
        x1_index = parseInt(k_x1_index)
        break;
      }
    }
    var x2_index = null
    for (let k_x2_index in kLineData) {
      if (this.Position[1][0] == kLineData[k_x2_index].datetime) {
        x2_index = parseInt(k_x2_index)
        break;
      }
    }
    var x1 = (ZOOM_SEED[ChartSize.getInstance().CurScaleIndex][0] + ZOOM_SEED[ChartSize.getInstance().CurScaleIndex][1]) * (x1_index + 1) - ZOOM_SEED[ChartSize.getInstance().CurScaleIndex][0] / 2 - ZOOM_SEED[ChartSize.getInstance().CurScaleIndex][1] + this.Option.position.left + ChartSize.getInstance().GetLeft()
    var y1 = this.Option.height - ChartSize.getInstance().GetExtraHeight() - (this.Position[0][1] - this.Option['yAxis'].Min) * this.Option['yAxis'].unitPricePx + ChartSize.getInstance().GetTop() + ChartSize.getInstance().GetTitleHeight() + this.Option.position.top
    var x2 = (ZOOM_SEED[ChartSize.getInstance().CurScaleIndex][0] + ZOOM_SEED[ChartSize.getInstance().CurScaleIndex][1]) * (x2_index + 1) - ZOOM_SEED[ChartSize.getInstance().CurScaleIndex][0] / 2 - ZOOM_SEED[ChartSize.getInstance().CurScaleIndex][1] + this.Option.position.left + ChartSize.getInstance().GetLeft()
    var y2 = this.Option.height - ChartSize.getInstance().GetExtraHeight() - (this.Position[1][1] - this.Option['yAxis'].Min) * this.Option['yAxis'].unitPricePx + ChartSize.getInstance().GetTop() + ChartSize.getInstance().GetTitleHeight() + this.Option.position.top
    this.Canvas.beginPath()
    if (x1 == x2) {
      this.Canvas.moveTo(x1 - 5, y1);
      this.Canvas.lineTo(x1 + 5, y1);
      this.Canvas.lineTo(x2 + 5, y2);
      this.Canvas.lineTo(x2 - 5, y2);
    } else {
      this.Canvas.moveTo(x1, y1 + 5)
      this.Canvas.lineTo(x1, y1 - 5)
      this.Canvas.lineTo(x2, y2 - 5)
      this.Canvas.lineTo(x2, y2 + 5)
    }
    this.Canvas.closePath()
    if (this.Canvas.isPointInPath(x, y)) {
      return 100
    }
    return -1
  }

  this.IsPointInRectPath = function (x, y) {
    if (!this.Option) return -1
    if (this.Position.length < this.PointCount) return -1
    const kLineData = ChartData.getInstance().Data
    for (let i in this.Position) {
      var index = null
      for (let k in kLineData) {
        if (this.Position[i][0] == kLineData[k].datetime) {
          index = parseInt(k)
          break;
        }
      }
      this.Canvas.beginPath();
      var ex = (ZOOM_SEED[ChartSize.getInstance().CurScaleIndex][0] + ZOOM_SEED[ChartSize.getInstance().CurScaleIndex][1]) * (index + 1) - ZOOM_SEED[ChartSize.getInstance().CurScaleIndex][0] / 2 - ZOOM_SEED[ChartSize.getInstance().CurScaleIndex][1] + this.Option.position.left + ChartSize.getInstance().GetLeft()
      var ey = this.Option.height - ChartSize.getInstance().GetExtraHeight() - (this.Position[i][1] - this.Option['yAxis'].Min) * this.Option['yAxis'].unitPricePx + ChartSize.getInstance().GetTop() + ChartSize.getInstance().GetTitleHeight() + this.Option.position.top
      this.Canvas.arc(ex, ey, 5, 0, 360);
      if (this.Canvas.isPointInPath(x, y)) return i;
    }
    var x1_index = null
    for (let k_x1_index in kLineData) {
      if (this.Position[0][0] == kLineData[k_x1_index].datetime) {
        x1_index = parseInt(k_x1_index)
        break;
      }
    }
    var x2_index = null
    for (let k_x2_index in kLineData) {
      if (this.Position[1][0] == kLineData[k_x2_index].datetime) {
        x2_index = parseInt(k_x2_index)
        break;
      }
    }
    var x1 = (ZOOM_SEED[ChartSize.getInstance().CurScaleIndex][0] + ZOOM_SEED[ChartSize.getInstance().CurScaleIndex][1]) * (x1_index + 1) - ZOOM_SEED[ChartSize.getInstance().CurScaleIndex][0] / 2 - ZOOM_SEED[ChartSize.getInstance().CurScaleIndex][1] + this.Option.position.left + ChartSize.getInstance().GetLeft()
    var y1 = this.Option.height - ChartSize.getInstance().GetExtraHeight() - (this.Position[0][1] - this.Option['yAxis'].Min) * this.Option['yAxis'].unitPricePx + ChartSize.getInstance().GetTop() + ChartSize.getInstance().GetTitleHeight() + this.Option.position.top
    var x2 = (ZOOM_SEED[ChartSize.getInstance().CurScaleIndex][0] + ZOOM_SEED[ChartSize.getInstance().CurScaleIndex][1]) * (x2_index + 1) - ZOOM_SEED[ChartSize.getInstance().CurScaleIndex][0] / 2 - ZOOM_SEED[ChartSize.getInstance().CurScaleIndex][1] + this.Option.position.left + ChartSize.getInstance().GetLeft()
    var y2 = this.Option.height - ChartSize.getInstance().GetExtraHeight() - (this.Position[1][1] - this.Option['yAxis'].Min) * this.Option['yAxis'].unitPricePx + ChartSize.getInstance().GetTop() + ChartSize.getInstance().GetTitleHeight() + this.Option.position.top
    //是否在矩形边框上
    var linePoint = [{ X: x1, Y: y1 }, { X: x2, Y: y1 }];
    if (this.IsPointInLine1(linePoint, x, y)) {
      return 100;
    }

    linePoint = [{ X: x2, Y: y1 }, { X: x2, Y: y2 }];
    if (this.IsPointInLine2(linePoint, x, y)) {
      return 100;
    }

    linePoint = [{ X: x2, Y: y2 }, { X: x1, Y: y2 }];
    if (this.IsPointInLine1(linePoint, x, y)) {
      return 100;
    }

    linePoint = [{ X: x1, Y: y2 }, { X: x1, Y: y1 }];
    if (this.IsPointInLine2(linePoint, x, y)) {
      return 100;
    }
    return -1;
  }

  this.IsPointInArcPath = function (x, y) {
    if (!this.Option) return -1
    if (this.Position.length < this.PointCount) return -1
    const kLineData = ChartData.getInstance().Data
    var index = null
    for (let k in kLineData) {
      if (this.Position[0][0] == kLineData[k].datetime) {
        index = parseInt(k)
        break;
      }
    }
    if (!index) {
      return -1
    }
    this.Canvas.beginPath();
    var ex = (ZOOM_SEED[ChartSize.getInstance().CurScaleIndex][0] + ZOOM_SEED[ChartSize.getInstance().CurScaleIndex][1]) * (index + 1) - ZOOM_SEED[ChartSize.getInstance().CurScaleIndex][0] / 2 - ZOOM_SEED[ChartSize.getInstance().CurScaleIndex][1] + this.Option.position.left + ChartSize.getInstance().GetLeft()
    var ey = this.Option.height - ChartSize.getInstance().GetExtraHeight() - (this.Position[0][1] - this.Option['yAxis'].Min) * this.Option['yAxis'].unitPricePx + ChartSize.getInstance().GetTop() + ChartSize.getInstance().GetTitleHeight() + this.Option.position.top
    this.Canvas.arc(ex, ey, this.Radius, 0, 2 * Math.PI);
    if (this.Canvas.isPointInPath(x, y)) return 0;
    return -1
  }

  //点是否在线段上 水平线段
  this.IsPointInLine1 = function (aryPoint, x, y) {
    this.Canvas.beginPath();
    this.Canvas.moveTo(aryPoint[0].X, aryPoint[0].Y + 5);
    this.Canvas.lineTo(aryPoint[0].X, aryPoint[0].Y - 5);
    this.Canvas.lineTo(aryPoint[1].X, aryPoint[1].Y - 5);
    this.Canvas.lineTo(aryPoint[1].X, aryPoint[1].Y + 5);
    this.Canvas.closePath();
    if (this.Canvas.isPointInPath(x, y))
      return true;
  }

  //垂直线段
  this.IsPointInLine2 = function (aryPoint, x, y) {
    this.Canvas.beginPath();
    this.Canvas.moveTo(aryPoint[0].X - 5, aryPoint[0].Y);
    this.Canvas.lineTo(aryPoint[0].X + 5, aryPoint[0].Y);
    this.Canvas.lineTo(aryPoint[1].X + 5, aryPoint[1].Y);
    this.Canvas.lineTo(aryPoint[1].X - 5, aryPoint[1].Y);
    this.Canvas.closePath();
    if (this.Canvas.isPointInPath(x, y))
      return true;
  }
}

// Signals 画法
function SignalsElement () {
  this.newMethod = ChartDrawPicture
  this.newMethod()
  delete this.newMethod

  this.PointCount = 1
  this.Color = g_GoTopChartResource.signalColor
  this.Radius = g_GoTopChartResource.signalRadius

  this.Draw = function (x, y) {
    var kLineData = ChartData.getInstance().Data
    if (this.Position.length == 0) return

    var centerX, centerY
    var index = null
    for (let k_index in kLineData) {
      if (this.Position[0][0] == kLineData[k_index].datetime) {
        index = parseInt(k_index)
        break;
      }
    }
    if (!index) return
    centerX = (ZOOM_SEED[ChartSize.getInstance().CurScaleIndex][0] + ZOOM_SEED[ChartSize.getInstance().CurScaleIndex][1]) * (index + 1) - ZOOM_SEED[ChartSize.getInstance().CurScaleIndex][0] / 2 - ZOOM_SEED[ChartSize.getInstance().CurScaleIndex][1] + this.Option.position.left + ChartSize.getInstance().GetLeft()
    centerY = this.Option.height - ChartSize.getInstance().GetExtraHeight() - (this.Position[0][1] - this.Option['yAxis'].Min) * this.Option['yAxis'].unitPricePx + ChartSize.getInstance().GetTop() + ChartSize.getInstance().GetTitleHeight() + this.Option.position.top

    let signType = ""
    if (this.ExtensionObj.type === 'buy') {
      signType = '买'
      this.Canvas.fillStyle = this.Color[0]
    } else {
      signType = '卖'
      this.Canvas.fillStyle = this.Color[1]
    }

    this.ClipFrame()
    this.Canvas.beginPath()
    this.Canvas.setLineDash([0, 0])
    this.Canvas.arc(centerX, centerY, this.Radius, 0, 2 * Math.PI)
    this.Canvas.fill()

    this.Canvas.font = '14px san-serif'
    this.Canvas.fillStyle = '#fff'
    this.Canvas.fillText(signType, (centerX - this.Radius / 2), centerY + this.Radius / 2.8)
    this.Canvas.fillText(this.Position[0][1], (centerX - this.Radius / 2), centerY + this.Radius + 15)
    this.Canvas.stroke()
    this.Canvas.closePath()


    this.Canvas.restore()
  }
}

// 线段画法
function LineElement () {
  this.newMethod = ChartDrawPicture
  this.newMethod()
  delete this.newMethod

  this.PointCount = 2
  this.Color = g_GoTopChartResource.LineColor[0]

  this.Draw = function (x, y) {
    var kLineData = ChartData.getInstance().Data
    if (this.Position.length == 0) return
    var startX, startY, endX, endY
    var x1_index = null
    for (let k_x1_index in kLineData) {
      if (this.Position[0][0] == kLineData[k_x1_index].datetime) {
        x1_index = parseInt(k_x1_index)
        break;
      }
    }
    if (!x1_index) {
      return
    }
    startX = (ZOOM_SEED[ChartSize.getInstance().CurScaleIndex][0] + ZOOM_SEED[ChartSize.getInstance().CurScaleIndex][1]) * (x1_index + 1) - ZOOM_SEED[ChartSize.getInstance().CurScaleIndex][0] / 2 - ZOOM_SEED[ChartSize.getInstance().CurScaleIndex][1] + this.Option.position.left + ChartSize.getInstance().GetLeft()
    startY = this.Option.height - ChartSize.getInstance().GetExtraHeight() - (this.Position[0][1] - this.Option['yAxis'].Min) * this.Option['yAxis'].unitPricePx + ChartSize.getInstance().GetTop() + ChartSize.getInstance().GetTitleHeight() + this.Option.position.top
    if (this.Position.length == this.PointCount) {
      var x2_index = null
      for (let k_x2_index in kLineData) {
        if (this.Position[1][0] == kLineData[k_x2_index].datetime) {
          x2_index = parseInt(k_x2_index)
          break;
        }
      }
      if (!x2_index) {
        return
      }
      endX = (ZOOM_SEED[ChartSize.getInstance().CurScaleIndex][0] + ZOOM_SEED[ChartSize.getInstance().CurScaleIndex][1]) * (x2_index + 1) - ZOOM_SEED[ChartSize.getInstance().CurScaleIndex][0] / 2 - ZOOM_SEED[ChartSize.getInstance().CurScaleIndex][1] + this.Option.position.left + ChartSize.getInstance().GetLeft()
      endY = this.Option.height - ChartSize.getInstance().GetExtraHeight() - (this.Position[1][1] - this.Option['yAxis'].Min) * this.Option['yAxis'].unitPricePx + ChartSize.getInstance().GetTop() + ChartSize.getInstance().GetTitleHeight() + this.Option.position.top
    } else {
      var index = Math.ceil((x - ChartSize.getInstance().GetLeft()) / (ZOOM_SEED[ChartSize.getInstance().CurScaleIndex][1] + ZOOM_SEED[ChartSize.getInstance().CurScaleIndex][0])) - 1
      endX = (ZOOM_SEED[ChartSize.getInstance().CurScaleIndex][0] + ZOOM_SEED[ChartSize.getInstance().CurScaleIndex][1]) * (index + 1) - ZOOM_SEED[ChartSize.getInstance().CurScaleIndex][0] / 2 - ZOOM_SEED[ChartSize.getInstance().CurScaleIndex][1] + this.Option.position.left + ChartSize.getInstance().GetLeft()
      endY = y
    }

    this.ClipFrame()
    this.Canvas.beginPath()
    this.Canvas.setLineDash([0, 0])
    this.Canvas.strokeStyle = this.Color
    this.Canvas.lineWidth = this.LineWidth
    this.Canvas.moveTo(ToFixedPoint(startX), ToFixedPoint(startY))
    this.Canvas.lineTo(ToFixedPoint(endX), ToFixedPoint(endY))
    this.Canvas.stroke()
    this.DrawPoint()
    this.Canvas.restore();
  }
}

// 矩形画法
function RectElement () {
  this.newMethod = ChartDrawPicture
  this.newMethod()
  delete this.newMethod

  this.PointCount = 2
  this.Color = g_GoTopChartResource.SelectColor
  this.FillColor = g_GoTopChartResource.RectBgColor

  this.Draw = function (x, y) {
    if (this.Position.length == 0) return
    const kLineData = ChartData.getInstance().Data
    var startX, startY, endX, endY
    var x1_index = null
    for (let k_x1_index in kLineData) {
      if (this.Position[0][0] == kLineData[k_x1_index].datetime) {
        x1_index = parseInt(k_x1_index)
        break;
      }
    }
    if (!x1_index) {
      return
    }
    startX = (ZOOM_SEED[ChartSize.getInstance().CurScaleIndex][0] + ZOOM_SEED[ChartSize.getInstance().CurScaleIndex][1]) * (x1_index + 1) - ZOOM_SEED[ChartSize.getInstance().CurScaleIndex][0] / 2 - ZOOM_SEED[ChartSize.getInstance().CurScaleIndex][1] + this.Option.position.left + ChartSize.getInstance().GetLeft()
    startY = this.Option.height - ChartSize.getInstance().GetExtraHeight() - (this.Position[0][1] - this.Option['yAxis'].Min) * this.Option['yAxis'].unitPricePx + ChartSize.getInstance().GetTop() + ChartSize.getInstance().GetTitleHeight() + this.Option.position.top
    if (this.Position.length == this.PointCount) {
      var x2_index = null
      for (let k_x2_index in kLineData) {
        if (this.Position[1][0] == kLineData[k_x2_index].datetime) {
          x2_index = parseInt(k_x2_index)
          break;
        }
      }
      if (!x2_index) {
        return
      }
      endX = (ZOOM_SEED[ChartSize.getInstance().CurScaleIndex][0] + ZOOM_SEED[ChartSize.getInstance().CurScaleIndex][1]) * (x2_index + 1) - ZOOM_SEED[ChartSize.getInstance().CurScaleIndex][0] / 2 - ZOOM_SEED[ChartSize.getInstance().CurScaleIndex][1] + this.Option.position.left + ChartSize.getInstance().GetLeft()
      endY = this.Option.height - ChartSize.getInstance().GetExtraHeight() - (this.Position[1][1] - this.Option['yAxis'].Min) * this.Option['yAxis'].unitPricePx + ChartSize.getInstance().GetTop() + ChartSize.getInstance().GetTitleHeight() + this.Option.position.top
    } else {
      var index = Math.ceil((x - ChartSize.getInstance().GetLeft()) / (ZOOM_SEED[ChartSize.getInstance().CurScaleIndex][1] + ZOOM_SEED[ChartSize.getInstance().CurScaleIndex][0])) - 1
      endX = (ZOOM_SEED[ChartSize.getInstance().CurScaleIndex][0] + ZOOM_SEED[ChartSize.getInstance().CurScaleIndex][1]) * (index + 1) - ZOOM_SEED[ChartSize.getInstance().CurScaleIndex][0] / 2 - ZOOM_SEED[ChartSize.getInstance().CurScaleIndex][1] + this.Option.position.left + ChartSize.getInstance().GetLeft()
      endY = y
    }
    this.ClipFrame()

    this.Canvas.beginPath()
    this.Canvas.strokeStyle = this.Color
    this.Canvas.setLineDash([0, 0])
    this.Canvas.fillStyle = this.FillColor
    this.Canvas.fillRect(ToFixedRect(startX), ToFixedRect(startY), ToFixedRect(endX - startX), ToFixedRect(endY - startY))
    this.Canvas.stroke()
    this.DrawPoint()
    this.Canvas.restore();
  }
}

////////////////////////////////////////////
// 
//             窗口基类
//
////////////////////////////////////////////
function DivDialog () {
  this.DivElement
  this.ParentDivElement
  this.IsHide = true

  this.Create = function () {

  }

  this.SetPosition = function (x, y) {
    this.DivElement.style.left = x + 'px'
    this.DivElement.style.top = y + 'px'
  }

  this.SetShow = function () {
    this.isHide = false
    this.DivElement.style.display = 'flex'
  }

  this.SetHide = function () {
    this.isHide = true
    this.DivElement.style.display = 'none'
  }

  this.GetPosition = function () {
    return {
      x: parseFloat(this.DivElement.style.left.replace('px', '')),
      y: parseFloat(this.DivElement.style.top.replace('px', ''))
    }
  }

  this.GetHeight = function () {
    return this.DivElement.offsetHeight
  }

  this.GetWidth = function () {

  }

}

// 画图右键操作窗口
function DrawPictureOptDialog () {
  this.newMethod = DivDialog
  this.newMethod()
  delete this.newMethod

  this.Create = function () {
    this.DivElement = document.createElement('div')
    this.DivElement.className = 'draw-tool-opt-dialog'
    this.DivElement.id = 'draw-tool-opt-dialog'
    this.DivElement.style.display = 'none'
    this.DivElement.innerHTML =
      '<div class="item" style="width:' + ChartSize.getInstance().DrawPictureOptDialogWidth + 'px" id="draw-tool-opt_delete"><span class="iconfont icon-shanchu1"></span><span style="margin-left:10px">删除</span><span class="label">Del</span></div>'
    this.DivElement.oncontextmenu = function (e) {
      e.preventDefault()
    }
    return this.DivElement
  }

  this.RegisterClickEvent = function (callback) {
    $('#draw-tool-opt_delete').click(function (e) {
      callback('delete')
      e.preventDefault()
    })
  }
}

// 周期选择创库
function PeriodDialog () {
  this.newMethod = DivDialog
  this.newMethod()
  delete this.newMethod
}

// 跳转dialog
function GoToDialog () {
  this.newMethod = DivDialog
  this.newMethod()
  delete this.newMethod

  this.Create = function () {
    this.DivElement = document.createElement('div')
    this.DivElement.className = "goto-dialog"
    this.DivElement.id = "goto-dialog"
    this.DivElement.display = 'none'

    this.DivElement.innerHTML =
      '<div style="padding:30px 20px;display:flex;border-bottom:1px solid #8d9bab"><span style="color:#fff;font-size:14px;flex-grow:1;">前往到</span><span id="goto-close" class="iconfont icon-guanbi" style="color:#fff;"></span></div>\n' +
      '<div style="padding:30px 20px;display:flex;">\n' +
      '<input id="date-d" class="date-cal" placeholder="日期" type="text" ></input>\n' +
      '<input id="time-d" class="time-cal" placeholder="时间"  type="text" ></input>\n' +
      '<span id="goto-btn" class="iconfont icon-tiaozhuan" style="color:#fff;margin-left:20px;padding:10px;background:#2196f3;border-radius:3px;"></span>\n' +
      '</div>'

    this.DivElement.style.top = (ChartSize.getInstance().ChartContentHeight - this.GetHeight()) / 2 - 100 + 'px'
    this.DivElement.style.left = (ChartSize.getInstance().ChartContentWidth - 300) / 2 + 'px'
    this.DivElement.style.display = 'none'

    return this.DivElement
  }

  this.RegisterClickEvent = function (callback) {
    $('#goto-btn').click(function (e) {
      callback('goto')
      e.preventDefault()
    })
    $('#goto-close').click(function (e) {
      callback('goto-close')
      e.preventDefault()
    })
  }

  this.SetShow = function () {
    this.isHide = false
    this.DivElement.style.display = ''
  }
}

////////////////////////////////////////////
// 
//             标题画法
//
////////////////////////////////////////////
function ChartTitlePainting () {
  this.Name
  this.Option
  this.DivElement
  this.IndicatorElement
  this.CurValue
  this.IndicatorList

  this.Create = function (option, indicatorList) {
    this.Name = option.name
    this.Option = option
    this.IndicatorList = indicatorList
    this.DivElement = document.createElement('div')
    this.DivElement.className = "title-tool"
    this.DivElement.id = this.Name + '-title-tool'
    this.DivElement.innerHTML =
      '<div id="' + this.Name + 'left-box" class="left-box">\n' +
      ' <div id="' + this.Name + 'name-box">\n' +
      '   <span id="' + this.Name + 'name" style="color:#8d9bab"></span>\n' +
      '   <span id="' + this.Name + 'show-hide" class="iconfont icon-xianshi icon" style="color:#8d9bab;font-size:18px;margin-left:5px"></span>\n' +
      '   <span id="' + this.Name + 'settings" class="iconfont icon-shezhi icon" style="color:#8d9bab;font-size:18px;margin-left:5px"></span>\n' +
      '   <span id="' + this.Name + 'close-icon" class="iconfont icon-guanbi icon" style="color:#8d9bab;font-size:18px;margin-left:5px"></span>\n' +
      ' </div>\n' +
      ' <div id="' + this.Name + 'value-box" style="margin-left:10px"></div>\n' +
      '</div>\n' +
      '<div style="flex-grow:1"></div>\n' +
      '<div id="' + this.Name + 'right-box">\n' +
      '   <span id="' + this.Name + 'show-hide" class="iconfont icon-xiajiangxiajiantouxiangxiadiexianxing icon" style="color:#8d9bab;font-size:20px;margin-left:5px"></span>\n' +
      '   <span id="' + this.Name + 'settings" class="iconfont icon-shangshengshangjiantouxiangshangzhangxianxing icon" style="color:#8d9bab;font-size:20px;margin-left:5px"></span>\n' +
      '   <span id="' + this.Name + 'scale" class="iconfont icon-quanping icon" style="color:#8d9bab;font-size:20px;margin-left:5px"></span>\n' +
      '   <span id="' + this.Name + 'close" class="iconfont icon-guanbi icon" style="color:#8d9bab;font-size:20px;margin-left:5px"></span>\n' +
      '<div>'
    return this.DivElement
  }

  this.CreateIndicatorTitle = function () {
    this.IndicatorElement = document.createElement('div')
    this.IndicatorElement.className = 'indicator-title-tool'
    this.IndicatorElement.id = this.Name + '-indicator-title-tool'
    for (let i in this.IndicatorList) {
      var div = document.createElement('div')
      div.className = 'indicator-title-tool-item'
      div.id = i + '-indicator-title-tool-item'
      div.innerHTML =
        '<div id="' + i + 'left-box" class="left-box">\n' +
        ' <div id="' + i + 'name-box">\n' +
        '   <span id="' + i + 'name" style="color:#8d9bab"></span>\n' +
        '   <span id="' + i + 'show-hide" class="iconfont icon-xianshi icon" style="color:#8d9bab;font-size:18px;margin-left:5px"></span>\n' +
        '   <span id="' + i + 'settings" class="iconfont icon-shezhi icon" style="color:#8d9bab;font-size:18px;margin-left:5px"></span>\n' +
        '   <span id="' + i + 'close-icon" class="iconfont icon-guanbi icon" style="color:#8d9bab;font-size:18px;margin-left:5px"></span>\n' +
        ' </div>\n' +
        ' <div id="' + i + 'value-box" style="margin-left:10px"></div>\n' +
        '</div>'
      this.IndicatorElement.appendChild(div)
    }
    return this.IndicatorElement
  }

  this.SetSize = function () {
    this.DivElement.style.top = this.Option.position.top + 10 + 'px'
    this.DivElement.style.left = this.Option.position.left + 10 + 'px'
    this.DivElement.style.width = ChartSize.getInstance().ChartContentWidth - ChartSize.getInstance().YAxisWidth - ChartSize.getInstance().GetLeft() - 20 + 'px'
    this.IndicatorElement.style.top = this.Option.position.top + 10 + 30 + 'px'
    this.IndicatorElement.style.left = this.Option.position.left + 10 + 'px'
  }

  this.CreateValueBoX = function () {
    var valueElement = document.getElementById(this.Name + 'value-box')
    if (this.Name == 'kLine') {
      $('#' + this.Name + 'name').text(this.Option.symbol).css('font-size', '18px')
      valueElement.innerHTML =
        '<span class="value-box_label">开=</span><span id="open" class="value-box_value"></span>\n' +
        '<span class="value-box_label">高=</span><span id="high" class="value-box_value"></span>\n' +
        '<span class="value-box_label">低=</span><span id="low" class="value-box_value"></span>\n' +
        '<span class="value-box_label">收=</span><span id="close" class="value-box_value"></span>\n' +
        '<span id="rate" class="value-box_value"></span>'
    } else {
      $('#' + this.Name + 'name').text(this.Option.name).css('font-size', '16px')
      for (let i in this.Option.style) {
        var span = document.createElement('span')
        span.id = i
        span.className = 'value-box_value'
        span.style.marginRight = 10 + 'px'
        valueElement.appendChild(span)
      }
    }
  }

  this.CreateIndicatorValueBox = function () {
    for (let i in this.IndicatorList) {
      var valueElement = document.getElementById(i + 'value-box')
      $('#' + i + 'name').text(i).css('font-size', '14px')
      for (let j in this.IndicatorList[i].style) {
        var span = document.createElement('span')
        span.id = j
        span.className = 'value-box_value'
        span.style.marginRight = 10 + 'px'
        valueElement.appendChild(span)
      }
    }
  }

  this.SetValue = function (curValue, indicatorValue) {
    if (this.Name == 'kLine') {
      var colorStyle
      if (curValue['open'] > curValue['close']) {
        colorStyle = g_GoTopChartResource.DownColor
      } else if (curValue['open'] < curValue['close']) {
        colorStyle = g_GoTopChartResource.UpColor
      } else {
        colorStyle = g_GoTopChartResource.FontColor
      }
      for (let i in curValue) {
        $('#' + i).css('color', colorStyle)
        $('#' + i).text(curValue[i])
      }
      for (let j in this.IndicatorList) {
        for (let k in indicatorValue[j]) {
          $('#' + k).css('color', this.IndicatorList[j].style[k].color)
          $('#' + k).text(indicatorValue[j][k])
        }
      }
    } else if (this.Name == 'MACD') {
      for (let i in curValue) {
        if (i == 'MACD') {
          curValue[i] > 0 ? $('#' + i).css('color', this.Option.style[i].color.up) : $('#' + i).css('color', this.Option.style[i].color.down)
        } else {
          $('#' + i).css('color', this.Option.style[i].color)
        }
        $('#' + i).text(curValue[i].toFixed(4))
      }
    }
  }
}

////////////////////////////////////////////
// 
//             十字光标
//
////////////////////////////////////////////
function CrossCursor () {
  this.Canvas
  this.OptCanvas
  this.XAxisOption
  this.ChartFramePaintingList
  this.IsShow
  var self = this

  this.Create = function (canvas, optCanvas, frameList, xAxisOption) {
    this.Canvas = canvas
    this.OptCanvas = optCanvas
    this.ChartFramePaintingList = frameList
    this.XAxisOption = xAxisOption
  }

  this.Move = function (x, y) {
    let kn = Math.ceil((x - ChartSize.getInstance().GetLeft()) / (ZOOM_SEED[ChartSize.getInstance().CurScaleIndex][1] + ZOOM_SEED[ChartSize.getInstance().CurScaleIndex][0]))
    let cursorX = (ZOOM_SEED[ChartSize.getInstance().CurScaleIndex][0] + ZOOM_SEED[ChartSize.getInstance().CurScaleIndex][1]) * kn - ZOOM_SEED[ChartSize.getInstance().CurScaleIndex][0] / 2 - ZOOM_SEED[ChartSize.getInstance().CurScaleIndex][1] + ChartSize.getInstance().GetLeft()
    this.OptCanvas.beginPath()
    this.OptCanvas.strokeStyle = g_GoTopChartResource.FontColor
    this.OptCanvas.lineWidth = 1
    this.OptCanvas.setLineDash([5, 5])
    this.OptCanvas.moveTo(ToFixedPoint(cursorX), ToFixedPoint(0))
    this.OptCanvas.lineTo(ToFixedPoint(cursorX), ToFixedPoint(ChartSize.getInstance().ChartContentHeight - ChartSize.getInstance().XAxisHeight))
    this.OptCanvas.moveTo(ToFixedPoint(0), ToFixedPoint(y))
    this.OptCanvas.lineTo(ToFixedPoint(ChartSize.getInstance().ChartContentWidth - ChartSize.getInstance().YAxisWidth), ToFixedPoint(y))
    this.OptCanvas.stroke()
    this.OptCanvas.closePath()
    this.DrawLabel(kn - 1, cursorX, y)
    return kn - 1
  }

  this.DrawLabel = function (index, x, y) {
    let itemData = ChartData.getInstance().Data[index]
    const xtw = this.OptCanvas.measureText(itemData.datetime).width

    this.OptCanvas.beginPath()
    // this.OptCanvas.clearRect(0, this.XAxisOption['position']['top'], this.XAxisOption['width'], this.XAxisOption['height'])
    this.OptCanvas.fillStyle = g_GoTopChartResource.BorderColor
    if (x < xtw / 2 + 10) {
      this.OptCanvas.fillRect(ToFixedRect(0), ToFixedRect(this.XAxisOption['position']['top']), ToFixedRect(xtw + 20), ToFixedRect(this.XAxisOption['height'] - 5))
      this.OptCanvas.font = "12px sans-serif"
      this.OptCanvas.fillStyle = g_GoTopChartResource.FontLightColor
      this.OptCanvas.fillText(parseTime(itemData.datetime), ToFixedPoint(10), this.XAxisOption['position']['top'] + 18)
    } else if (x > ChartData.getInstance().ChartContentWidth - ChartData.getInstance().YAxisWidth - (xtw / 2 + 10)) {
      this.OptCanvas.fillRect(ToFixedRect(ChartData.getInstance().ChartContentWidth - ChartData.getInstance().YAxisWidth - xtw - 10), ToFixedRect(this.XAxisOption['position']['top']), ToFixedRect(xtw + 20), ToFixedRect(this.XAxisOption['height'] - 5))
      this.OptCanvas.font = "12px sans-serif"
      this.OptCanvas.fillStyle = g_GoTopChartResource.FontLightColor
      this.OptCanvas.fillText(parseTime(itemData.datetime), ToFixedPoint(ChartData.getInstance().ChartContentWidth - ChartData.getInstance().YAxisWidth - xtw / 2 - 10), this.XAxisOption['position']['top'] + 18)
    } else {
      this.OptCanvas.fillRect(ToFixedRect(x - xtw / 2 - 10), ToFixedRect(this.XAxisOption['position']['top']), ToFixedRect(xtw + 20), ToFixedRect(this.XAxisOption['height'] - 5))
      this.OptCanvas.font = "12px sans-serif"
      this.OptCanvas.fillStyle = g_GoTopChartResource.FontLightColor
      this.OptCanvas.fillText(parseTime(itemData.datetime), ToFixedPoint(x - xtw / 2), this.XAxisOption['position']['top'] + 18)
    }

    this.OptCanvas.strokeStyle = g_GoTopChartResource.FontLightColor
    this.OptCanvas.lineWidth = 1
    this.OptCanvas.moveTo(ToFixedPoint(x), ToFixedPoint(this.XAxisOption['position']['top']))
    this.OptCanvas.lineTo(ToFixedPoint(x), this.XAxisOption['position']['top'] + 5)

    this.OptCanvas.stroke()
    this.OptCanvas.closePath()

    var drawYAxisLabel = function (option) {
      self.OptCanvas.beginPath()
      self.OptCanvas.fillStyle = g_GoTopChartResource.BorderColor
      self.OptCanvas.fillRect(ToFixedRect(ChartSize.getInstance().ChartContentWidth - ChartSize.getInstance().YAxisWidth), ToFixedRect(y - 10), ToFixedRect(ChartSize.getInstance().YAxisWidth), ToFixedRect(20))
      self.OptCanvas.font = '12px san-serif'
      self.OptCanvas.fillStyle = g_GoTopChartResource.FontLightColor
      self.OptCanvas.fillText(((((option['height'] - ChartSize.getInstance().GetTop() - ChartSize.getInstance().GetBottom() - ChartSize.getInstance().GetTitleHeight()) - (y - option['position']['top'] - ChartSize.getInstance().GetTop() - ChartSize.getInstance().GetTitleHeight())) / option['yAxis'].unitPricePx) + option['yAxis'].Min).toFixed(4), ChartSize.getInstance().ChartContentWidth - ChartSize.getInstance().YAxisWidth + 10, y + 5)
      self.OptCanvas.lineWidth = 1
      self.OptCanvas.strokeStyle = g_GoTopChartResource.FontLightColor
      self.OptCanvas.moveTo(ChartSize.getInstance().ChartContentWidth - ChartSize.getInstance().YAxisWidth, ToFixedPoint(y))
      self.OptCanvas.lineTo(ChartSize.getInstance().ChartContentWidth - ChartSize.getInstance().YAxisWidth + 5, ToFixedPoint(y))
      self.OptCanvas.stroke()
      self.OptCanvas.closePath()
    }

    // 绘制Y轴上的标识
    for (let i in this.ChartFramePaintingList) {
      if (y < this.ChartFramePaintingList[i].Option['position']['top'] + this.ChartFramePaintingList[i].Option['height'] && y > this.ChartFramePaintingList[i].Option['position']['top']) {
        drawYAxisLabel(this.ChartFramePaintingList[i].Option)
      }
    }
  }
}

////////////////////////////////////////////
// 
//             图表数据处理基类
//
////////////////////////////////////////////
function DataObj () {
  var datetime
  var open
  var high
  var low
  var close         // 当前K线未结束则为最新价
  var volumn
  var closetime     // 收盘时间
}

function ChartData () {
  this.Instance = null
  this.Data = new Array()
  this.NewData
  this.DataOffSet
  this.Symbol
  this.Limit = 1000
  this.BorrowKLineNum
  this.PeriodData = {}

  this.AddHistoryData = function () {

  }

  this.AddRealTimeData = function () {

  }

  this.GetMinutePeriodData = function (period) {

  }

  this.GetDayPeriodData = function (period) {

  }

  this.GetPeriodData = function (period) {
  }

  this.GetCurShowData = function () {
    return Data
  }

  this.GetEndTimeOfPeriodData = function (period) {
    return this.PeriodData[period].Data[this.PeriodData[period].Data.length - 1].datetime
  }

  this.GetStartTimeOfPeriodData = function (period) {
    return this.PeriodData[period].Data[0].datetime
  }
}

ChartData.getInstance = function () {
  if (!this.Instance) {
    this.Instance = new ChartData()
  }
  return this.Instance
}

function IndicatorData () {
  this.newMethod = ChartData
  this.newMethod()
  delete this.newMethod

  this.Name
  this.KLineData
  this.RequestType // 数据请求类型  local：本地计算、network：网络请求
  this.DataType    // 数据类型 0：不连续性、1：连续性

}

function DrawPictureData () {
  this.Name
  this.RequestType

  this.Data

  this.Create = function (name, data) {

  }
}

////////////////////////////////////////////
// 
//             全局图表配置
//
////////////////////////////////////////////
function GoTopChartResource () {
  this.TopToolHeightPx = 38
  this.LeftToolWidthPx = 60

  this.BgColor = "#1f1f36"
  this.BorderColor = "#3c4564"
  this.FontColor = "#bfcbd9"
  this.FontLightColor = "#ffffff"
  this.RectBgColor = "#4985e780"
  this.SelectColor = "#4985e7"
  this.UpColor = "#26a69a"
  this.DownColor = "#ef5350"
  this.BorderWidth = [2, 1]
  this.SettingsList
  this.LineColor = ['#ffc400'],
    this.signalColor = ['#26a69a', '#ef5350']
  this.signalRadius = 15

  this.Domain = "https://api.binance.com"
}

var g_GoTopChartResource = new GoTopChartResource()
var pixelTatio = GetDevicePixelRatio();
//周期条件枚举
var CONDITION_PERIOD =
{
  //K线周期  1d=日线 1w=周线 1M=月线 1y=年线 1m=1分钟 5m=5分钟 15m=15分钟 30m=30分钟 1h=60分钟
  "1d": 0,
  "1w": 1,
  "1M": 2,
  "1y": 3,
  "1m": 4,
  "5m": 5,
  "15m": 6,
  "30m": 7,
  "1h": 8
};

var ZOOM_SEED =
  [
    [48, 10], [44, 10],
    [40, 9], [36, 9],
    [32, 8], [28, 8],
    [24, 7], [20, 7],
    [18, 6], [16, 6],
    [14, 5], [12, 5],
    [8, 4], [6, 4],
    [6, 3], [3, 3],
    [3, 1], [2, 1],
    [1, 1], [1, 0.5],
    [1, 0.2], [1, 0.1],
    [0.8, 0.1], [0.6, 0.1],
    [0.5, 0.1], [0.4, 0.1],
    [0.3, 0.1], [0.2, 0.1]
  ];

function GetDevicePixelRatio () {
  if (typeof (window) == 'undefined') return 1;
  return window.devicePixelRatio || 1;
}

function saveJsonToFile (oData, fileName) {
  var blob = new Blob([JSON.stringify(oData)], {
    type: "text/plain;charset=utf-8"
  });
  saveAs(blob, fileName + '.json');
}

function Guid () {
  function S4 () {
    return (((1 + Math.random()) * 0x10000) | 0).toString(16).substring(1);
  }
  return (S4() + S4() + "-" + S4() + "-" + S4() + "-" + S4() + "-" + S4() + S4() + S4());
}

function ToFixedPoint (value) {
  return parseInt(value) + 0.5;
}

function ToFixedRect (value) {
  var rounded;
  return rounded = (0.5 + value) << 0;
}

function accAdd (arg1, arg2) {
  var r1, r2, m;
  try {
    r1 = arg1.toString().split(".")[1].length
  } catch (e) {
    r1 = 0
  } try {
    r2 = arg2.toString().split(".")[1].length
  } catch (e) { r2 = 0 } m = Math.pow(10, Math.max(r1, r2))
  return (arg1 * m + arg2 * m) / m
}

function date2TimeStamp (str) {
  const date = new Date(str.replace(/-/g, '/'))
  return Date.parse(date)
}

function parseTime (time, cFormat) {
  if (arguments.length === 0 || !time) {
    return null
  }
  const format = cFormat || '{y}-{m}-{d} {h}:{i}:{s}'
  let date
  if (typeof time === 'object') {
    date = time
  } else {
    if ((typeof time === 'string')) {
      if ((/^[0-9]+$/.test(time))) {
        // support "1548221490638"
        time = parseInt(time)
      } else {
        // support safari
        // https://stackoverflow.com/questions/4310953/invalid-date-in-safari
        time = time.replace(new RegExp(/-/gm), '/')
      }
    }

    if ((typeof time === 'number') && (time.toString().length === 10)) {
      time = time * 1000
    }
    date = new Date(time)
  }
  const formatObj = {
    y: date.getFullYear(),
    m: date.getMonth() + 1,
    d: date.getDate(),
    h: date.getHours(),
    i: date.getMinutes(),
    s: date.getSeconds(),
    a: date.getDay()
  }
  const time_str = format.replace(/{([ymdhisa])+}/g, (result, key) => {
    const value = formatObj[key]
    // Note: getDay() returns 0 on Sunday
    if (key === 'a') {
      return ['日', '一', '二', '三', '四', '五', '六'][value]
    }
    return value.toString().padStart(2, '0')
  })
  return time_str
}

Number.prototype.add = function (arg) {
  return accAdd(arg, this);
}