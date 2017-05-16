var app = angular.module('app', ['angularMoment']);
app.controller('controller', function($scope, $http) {

  $scope.user = 'TheConnMan';
  $scope.repo = 'docker-hub-rss';

  $scope.fetchFeed = function() {
    $scope.loading = true;
    $scope.error = false;
    $scope.url = '';
    $http({
      url: '/' + $scope.user + '/' + $scope.repo + '.atom',
      params: {
        include: $scope.include,
        exclude: $scope.exclude
      },
      transformResponse: function(data) {
        return new X2JS().xml_str2json(data);
      }
    }).then(({data, status, headers, config}) => {
      if (!Array.isArray(data.rss.channel.item)) {
        data.rss.channel.item = [data.rss.channel.item];
      }
      $scope.feed = data.rss.channel;
      var queryParams = Object.keys(config.params || {}).reduce((array, key) => {
        if (config.params[key]) {
          array.push(key + '=' + config.params[key]);
        }
        return array;
      }, []);
      $scope.url = window.location.origin + config.url + (queryParams.length > 0 ? '?' + queryParams.join('&') : '');
      $scope.loading = false;
    }).catch(error => {
      $scope.loading = false;
      $scope.error = true;
    });
  };

  $scope.fetchFeed();
});
