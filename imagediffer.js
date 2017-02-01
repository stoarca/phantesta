var ImageDiffer = function() {
  this.result = null;
  // TODO: kinda in the wrong place
  resemble.outputSettings({
    transparency: 0.5,
    largeImageThreshold: 0,
    useCrossOrigin: false,
  });
};
ImageDiffer.prototype.doDiff = function() {
  var self = this;
  var a = document.getElementById('a').files[0];
  var b = document.getElementById('b').files[0];
  return resemble(a).compareTo(b).ignoreAntialiasing().onComplete(function(result) {
    self.result = result;
    var image = new Image();
    document.getElementById('result').appendChild(image);
    image.src = result.getImageDataUrl();
  });
};
ImageDiffer.prototype.getResult = function() {
  return this.result;
};

var go = function() {
  var imageDiffer = new ImageDiffer();
  imageDiffer.doDiff();
};
