var app = angular.module('app', ['angularMoment']);
app.controller('controller', function($scope, $http) {

  $scope.user = 'TheConnMan';
  $scope.repo = 'docker-hub-rss';

  $scope.fetchFeed = function() {
    $scope.loading = true;
    $scope.error = false;
    $http({
      url: '/' + $scope.user + '/' + $scope.repo + '.atom',
      transformResponse: function(data) {
        return new X2JS().xml_str2json(data);
      }
    }).then(data => {
      $scope.feed = data.data.rss.channel;
      $scope.loading = false;
    }).catch(error => {
      $scope.loading = false;
      $scope.error = true;
    });
  };

  $scope.fetchFeed();
});
