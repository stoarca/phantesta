var ImageDiffer = function() {
  this.waiting = false;
  this.result = null;
  // TODO: kinda in the wrong place
  resemble.outputSettings({
    transparency: 0.5,
    largeImageThreshold: 0,
    useCrossOrigin: false,
  });
  this.skipBoxes = [];
  this.includeBoxes = [];
};
ImageDiffer.prototype.censorBoxes = function(boxes) {
  this.skipBoxes = boxes || [];
  return this;
};
ImageDiffer.prototype.includeOnlyBoxes = function(boxes) {
  this.includeBoxes = boxes || [];
  return this;
};
ImageDiffer.prototype.doDiff = function() {
  var self = this;
  this.waiting = true;
  this.result = null;
  var a = document.getElementById('a').files[0];
  var b = document.getElementById('b').files[0];
  return resemble(a)
    .compareTo(b)
    .ignoreNothing()
    .skip(this.skipBoxes)
    .include(this.includeBoxes)
    .onComplete(function(result) {
      self.waiting = false;
      self.result = result;
      var image = new Image();
      document.getElementById('result').appendChild(image);
      image.src = result.getImageDataUrl();
    });
}
ImageDiffer.prototype.isReady = function() {
  return !this.waiting;
};
ImageDiffer.prototype.getResult = function() {
  if (!this.result && this.waiting) {
    throw new Error('result is not ready yet!');
  }
  return this.result;
};

var go = function() {
  var imageDiffer = new ImageDiffer();
  imageDiffer.doDiff();
};
