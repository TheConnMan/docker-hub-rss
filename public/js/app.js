var app = angular.module('app', ['angularMoment']);
app.controller('controller', function($scope, $http, $location) {

  $scope.user = $location.search().user || 'TheConnMan';
  $scope.repo = $location.search().repo || 'docker-hub-rss';
  $scope.include = $location.search().include;
  $scope.exclude = $location.search().exclude;
  $scope.includeRegex = $location.search().includeRegex;
  $scope.excludeRegex = $location.search().excludeRegex;

  $scope.fetchFeed = function() {
    $scope.loading = true;
    $scope.error = false;
    $scope.url = '';
    $http({
      url: '/' + $scope.user + '/' + $scope.repo + '.atom',
      urlAlt: '/r/' + $scope.user + '/' + $scope.repo,
      params: {
        include: $scope.include,
        exclude: $scope.exclude,
        includeRegex: $scope.includeRegex,
        excludeRegex: $scope.excludeRegex
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
          array.push(key + '=' + encodeURIComponent(config.params[key]));
        }
        return array;
      }, []);
      $scope.url = window.location.origin + config.url + (queryParams.length > 0 ? '?' + queryParams.join('&') : '');
      $scope.urlAlt = window.location.origin + config.urlAlt + (queryParams.length > 0 ? '?' + queryParams.join('&') : '');
      $scope.loading = false;
      $location.search({
        user: $scope.user,
        repo: $scope.repo,
        include: $scope.include,
        exclude: $scope.exclude,
        includeRegex: $scope.includeRegex,
        excludeRegex: $scope.excludeRegex
      })
    }).catch(error => {
      $scope.loading = false;
      $scope.error = true;
    });
  };

  $scope.fetchFeed();
});
