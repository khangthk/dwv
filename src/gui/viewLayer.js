// namespaces
var dwv = dwv || {};
dwv.html = dwv.html || {};

/**
 * View layer.
 *
 * @param {object} containerDiv The layer div.
 * @class
 */
dwv.html.ViewLayer = function (containerDiv) {

  containerDiv.className += ' viewLayer';

  // closure to self
  var self = this;

  /**
   * The image view.
   *
   * @private
   * @type {object}
   */
  var view = null;
  /**
   * The view controller.
   *
   * @private
   * @type {object}
   */
  var viewController = null;

  /**
   * The base canvas.
   *
   * @private
   * @type {object}
   */
  var canvas = null;
  /**
   * A cache of the initial canvas.
   *
   * @private
   * @type {object}
   */
  var cacheCanvas = null;
  /**
   * The associated CanvasRenderingContext2D.
   *
   * @private
   * @type {object}
   */
  var context = null;

  /**
   * The image data array.
   *
   * @private
   * @type {Array}
   */
  var imageData = null;

  /**
   * The layer opacity.
   *
   * @private
   * @type {number}
   */
  var opacity = 1;

  /**
   * The layer scale.
   *
   * @private
   * @type {object}
   */
  var scale = {x: 1, y: 1};

  /**
   * The layer offset.
   *
   * @private
   * @type {object}
   */
  var offset = {x: 0, y: 0};

  /**
   * Listener handler.
   *
   * @type {object}
   * @private
   */
  var listenerHandler = new dwv.utils.ListenerHandler();

  /**
   * List of view event names.
   *
   * @type {Array}
   * @private
   */
  var viewEventNames = [
    'slicechange',
    'framechange',
    'wlwidthchange',
    'wlcenterchange',
    'wlpresetadd',
    'colourchange',
    'positionchange'
  ];

  /**
   * Get the view controller.
   *
   * @returns {object} The controller.
   */
  this.getViewController = function () {
    return viewController;
  };

  /**
   * Get the canvas image data.
   *
   * @returns {object} The image data.
   */
  this.getImageData = function () {
    return imageData;
  };

  /**
   * Set the image associated to the view.
   *
   * @param {object} img The image.
   */
  this.setViewImage = function (img) {
    view.setImage(img);
  };

  // common layer methods [start] ---------------

  /**
   * Get the layer opacity.
   *
   * @returns {number} The opacity ([0:1] range).
   */
  this.getOpacity = function () {
    return opacity;
  };

  /**
   * Set the layer opacity.
   *
   * @param {number} alpha The opacity ([0:1] range).
   */
  this.setOpacity = function (alpha) {
    opacity = alpha;
  };

  /**
   * Set the layer scale.
   *
   * @param {object} newScale The scale as {x,y}.
   */
  this.setScale = function (newScale) {
    scale = newScale;
  };

  /**
   * Set the layer offset.
   *
   * @param {object} newOffset The offset as {x,y}.
   */
  this.setOffset = function (newOffset) {
    offset = newOffset;
  };

  /**
   * Resize the layer.
   *
   * @param {object} size The layer size as {x,y}.
   * @param {object} newScale The layer scale as {x,y}.
   */
  this.resize = function (size, newScale) {
    canvas.width = size.x;
    canvas.height = size.y;
    scale = newScale;
  };

  /**
   * Display the layer.
   *
   * @param {boolean} flag Whether to display the layer or not.
   */
  this.display = function (flag) {
    containerDiv.style.display = flag ? '' : 'none';
  };

  /**
   * Check if the layer is visible.
   *
   * @returns {boolean} True if the layer is visible.
   */
  this.isVisible = function () {
    return containerDiv.style.display === '';
  };

  /**
   * Draw the content (imageData) of the layer.
   * The imageData variable needs to be set
   *
   * @fires dwv.App#renderstart
   * @fires dwv.App#renderend
   */
  this.draw = function () {
    /**
     * Render start event.
     *
     * @event dwv.App#renderstart
     * @type {object}
     * @property {string} type The event type.
     */
    var event = {type: 'renderstart'};
    fireEvent(event);

    // generate image data from DICOM
    view.generateImageData(imageData);
    // pass the data to the canvas
    cacheCanvas.getContext('2d').putImageData(imageData, 0, 0);

    // context opacity
    context.globalAlpha = opacity;

    // clear the context: reset the transform first
    // store the current transformation matrix
    context.save();
    // use the identity matrix while clearing the canvas
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, canvas.width, canvas.height);
    // restore the transform
    context.restore();

    // draw the cached canvas on the context
    // transform takes as input a, b, c, d, e, f to create
    // the transform matrix (column-major order):
    // [ a c e ]
    // [ b d f ]
    // [ 0 0 1 ]
    context.setTransform(
      scale.x,
      0,
      0,
      scale.y,
      -1 * offset.x * scale.x,
      -1 * offset.y * scale.y
    );

    // disable smoothing (set just before draw, could be reset by resize)
    context.imageSmoothingEnabled = false;
    // draw image
    context.drawImage(cacheCanvas, 0, 0);

    /**
     * Render end event.
     *
     * @event dwv.App#renderend
     * @type {object}
     * @property {string} type The event type.
     */
    event = {type: 'renderend'};
    fireEvent(event);
  };

  /**
   * Initialise the layer: set the canvas and context
   *
   * @param {object} image The image.
   * @param {object} metaData The image meta data.
   */
  this.initialise = function (image, metaData) {
    // create view
    var viewFactory = new dwv.image.ViewFactory();
    view = viewFactory.create(
      new dwv.dicom.DicomElementsWrapper(metaData),
      image);

    // local listeners
    view.addEventListener('wlwidthchange', onWLChange);
    view.addEventListener('wlcenterchange', onWLChange);
    view.addEventListener('colourchange', onColourChange);
    view.addEventListener('slicechange', onSliceChange);
    view.addEventListener('framechange', onFrameChange);

    // create view controller
    viewController = new dwv.ViewController(view);

    // get sizes
    var size = image.getGeometry().getSize();
    var inputWidth = size.getNumberOfColumns();
    var inputHeight = size.getNumberOfRows();

    // create canvas
    canvas = document.createElement('canvas');
    containerDiv.appendChild(canvas);

    // check that the getContext method exists
    if (!canvas.getContext) {
      alert('Error: no canvas.getContext method.');
      return;
    }
    // get the 2D context
    context = canvas.getContext('2d');
    if (!context) {
      alert('Error: failed to get the 2D context.');
      return;
    }
    // canvas sizes
    canvas.width = inputWidth;
    canvas.height = inputHeight;
    // original empty image data array
    context.clearRect(0, 0, canvas.width, canvas.height);
    imageData = context.createImageData(inputWidth, inputHeight);
    // cached canvas
    cacheCanvas = document.createElement('canvas');
    cacheCanvas.width = inputWidth;
    cacheCanvas.height = inputHeight;
  };

  /**
   * Activate the layer: propagate events.
   */
  this.activate = function () {
    // allow pointer events
    containerDiv.setAttribute('style', 'pointer-events: auto;');
    // interaction events
    var names = dwv.gui.interactionEventNames;
    for (var i = 0; i < names.length; ++i) {
      containerDiv.addEventListener(names[i], fireEvent);
    }
  };

  /**
   * Deactivate the layer: stop propagating events.
   */
  this.deactivate = function () {
    // disable pointer events
    containerDiv.setAttribute('style', 'pointer-events: none;');
    // interaction events
    var names = dwv.gui.interactionEventNames;
    for (var i = 0; i < names.length; ++i) {
      containerDiv.removeEventListener(names[i], fireEvent);
    }
  };

  /**
   * Add an event listener to this class.
   *
   * @param {string} type The event type.
   * @param {object} callback The method associated with the provided
   *   event type, will be called with the fired event.
   */
  this.addEventListener = function (type, callback) {
    listenerHandler.add(type, callback);
  };

  /**
   * Remove an event listener from this class.
   *
   * @param {string} type The event type.
   * @param {object} callback The method associated with the provided
   *   event type.
   */
  this.removeEventListener = function (type, callback) {
    listenerHandler.remove(type, callback);
  };

  /**
   * Fire an event: call all associated listeners with the input event object.
   *
   * @param {object} event The event to fire.
   * @private
   */
  function fireEvent(event) {
    listenerHandler.fireEvent(event);
  }

  // common layer methods [end] ---------------

  /**
   * Propagate (or not) view events.
   *
   * @param {boolean} flag True to propagate.
   */
  this.propagateViewEvents = function (flag) {
    // view events
    for (var j = 0; j < viewEventNames.length; ++j) {
      if (flag) {
        view.addEventListener(viewEventNames[j], fireEvent);
      } else {
        view.removeEventListener(viewEventNames[j], fireEvent);
      }
    }
  };

  /**
   * Handle window/level change.
   *
   * @param {object} event The event fired when changing the window/level.
   * @private
   */
  function onWLChange(event) {
    // generate and draw if no skip flag
    if (typeof event.skipGenerate === 'undefined' ||
      event.skipGenerate === false) {
      self.draw();
    }
  }

  /**
   * Handle colour map change.
   *
   * @param {object} _event The event fired when changing the colour map.
   * @private
   */
  function onColourChange(_event) {
    self.draw();
  }

  /**
   * Handle frame change.
   *
   * @param {object} event The event fired when changing the frame.
   * @private
   */
  function onFrameChange(event) {
    // generate and draw if no skip flag
    if (typeof event.skipGenerate === 'undefined' ||
      event.skipGenerate === false) {
      self.draw();
    }
  }

  /**
   * Handle slice change.
   *
   * @param {object} _event The event fired when changing the slice.
   * @private
   */
  function onSliceChange(_event) {
    self.draw();
  }

  /**
   * Clear the context and reset the image data.
   */
  this.clear = function () {
    context.clearRect(0, 0, canvas.width, canvas.height);
    imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    this.resetLayout();
  };

  /**
   * Align on another layer.
   *
   * @param {dwv.html.ViewLayer} rhs The layer to align on.
   */
  this.align = function (rhs) {
    canvas.style.top = rhs.getCanvas().offsetTop;
    canvas.style.left = rhs.getCanvas().offsetLeft;
  };

}; // ViewLayer class
