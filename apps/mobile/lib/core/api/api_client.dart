import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// API client for communicating with the Construction ERP backend.
class ApiClient {
  final Dio _dio;
  final FlutterSecureStorage _storage;

  ApiClient({String? baseUrl})
      : _dio = Dio(BaseOptions(
          baseUrl: baseUrl ?? 'http://localhost:3001/api/v1',
          connectTimeout: const Duration(seconds: 10),
          receiveTimeout: const Duration(seconds: 10),
        )),
        _storage = const FlutterSecureStorage() {
    _dio.interceptors.add(_AuthInterceptor(_storage));
  }

  Dio get dio => _dio;
}

class _AuthInterceptor extends Interceptor {
  final FlutterSecureStorage _storage;

  _AuthInterceptor(this._storage);

  @override
  void onRequest(RequestOptions options, RequestInterceptorHandler handler) async {
    final token = await _storage.read(key: 'access_token');
    if (token != null) {
      options.headers['Authorization'] = 'Bearer $token';
    }
    handler.next(options);
  }

  @override
  void onError(DioException err, ErrorInterceptorHandler handler) async {
    if (err.response?.statusCode == 401) {
      // TODO: Implement token refresh
      await _storage.delete(key: 'access_token');
    }
    handler.next(err);
  }
}
